import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { reportError } from '@/server/monitoring';
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import type { Portal } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { env } from '@/server/env';
import { AppError } from '@/server/http/errors';
import { ipHash, isSameOrigin, readCookie, userAgent } from '@/server/http/request';
import { SESSION_COOKIE, resolveSession, sessionCookie, type SessionContext } from '@/server/auth/session';
import { loadPermissions } from '@/server/authz/context';
import type { Permission } from '@/server/authz/permissions';
import { recordAudit } from '@/server/audit/audit';

/**
 * The single request pipeline (spec §9.1). Every /api/v1 route is declared through defineRoute(), so the order
 *   origin check → authentication → session validity → tenant resolution → permission → validation → handler
 * cannot be skipped or reordered. The tenant always comes from the session, never from the request.
 */

export type RequestMeta = { requestId: string; ipHash: string | null; userAgent: string | null };

export type AuthedContext = RequestMeta & {
  session: SessionContext;
  user: SessionContext['user'];
  /** Present for school users; null for platform users. */
  tenantId: string | null;
  permissions: Set<Permission>;
  can(p: Permission): boolean;
};

type Params = Record<string, string | string[]>;

type HandlerArgs<I, Q> = { req: Request; input: I; query: Q; params: Params };
type HandlerResult = Response | { status?: number; body: unknown; cookies?: CookieSpec[] } | unknown;
type CookieSpec = ResponseCookie;

type PublicRoute<I, Q> = {
  auth: 'public';
  input?: ZodType<I>;
  query?: ZodType<Q>;
  handler: (ctx: RequestMeta, args: HandlerArgs<I, Q>) => Promise<HandlerResult>;
};

type AuthedRoute<I, Q> = {
  auth: 'user';
  /** All listed permissions are required. */
  permission?: Permission | Permission[];
  /** At least one of these is required (checked before input validation, like `permission`). */
  anyPermission?: Permission[];
  /** Restrict to sessions from these portals (defence in depth on top of permissions). */
  portals?: Portal[];
  /** Routes reachable while a forced password change is pending (change-password, logout, me). */
  allowPendingPasswordChange?: boolean;
  /** Raise the 1 MB JSON body cap for this route (e.g. file uploads sent as base64). */
  maxBodyBytes?: number;
  input?: ZodType<I>;
  query?: ZodType<Q>;
  handler: (ctx: AuthedContext, args: HandlerArgs<I, Q>) => Promise<HandlerResult>;
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 1_000_000;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorResponse(err: AppError, requestId?: string) {
  return json({ error: { code: err.code, message: err.message, details: err.details, requestId } }, err.status);
}

async function parseInput<I>(req: Request, schema: ZodType<I> | undefined, max = MAX_BODY_BYTES): Promise<I> {
  if (!schema) return undefined as I;
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > max) throw new AppError('BAD_REQUEST', 'Request body too large');
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > max) throw new AppError('BAD_REQUEST', 'Request body too large');
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('BAD_REQUEST', 'Request body must be valid JSON');
  }
  return validate(schema, raw);
}

function validate<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw new AppError(
      'VALIDATION_FAILED',
      r.error.issues[0]?.message ?? 'Invalid input',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

function toResponse(result: HandlerResult): Response {
  if (result instanceof Response) return result;
  if (result && typeof result === 'object' && 'body' in result) {
    const r = result as { status?: number; body: unknown; cookies?: CookieSpec[] };
    const res = json(r.body, r.status ?? 200);
    for (const c of r.cookies ?? []) res.cookies.set(c);
    return res;
  }
  return json(result ?? { ok: true });
}

export function defineRoute<I = undefined, Q = undefined>(def: PublicRoute<I, Q> | AuthedRoute<I, Q>) {
  return async (req: Request, routeCtx: { params: Promise<Params> }): Promise<Response> => {
    const meta: RequestMeta = { requestId: crypto.randomUUID(), ipHash: ipHash(req), userAgent: userAgent(req) };
    try {
      if (MUTATING.has(req.method) && !isSameOrigin(req, env().APP_URL)) {
        throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
      }
      const params = (await routeCtx?.params) ?? {};
      const query = def.query
        ? validate(def.query, Object.fromEntries(new URL(req.url).searchParams.entries()))
        : (undefined as Q);

      if (def.auth === 'public') {
        const input = await parseInput(req, def.input);
        return toResponse(await def.handler(meta, { req, input, query, params }));
      }

      const session = await resolveSession(readCookie(req, SESSION_COOKIE));
      if (!session) throw new AppError('UNAUTHENTICATED', 'Please sign in');
      if (session.user.mustChangePassword && !def.allowPendingPasswordChange) {
        throw new AppError('PASSWORD_CHANGE_REQUIRED', 'You must change your password before continuing');
      }

      const permissions = await loadPermissions(session.user);
      const ctx: AuthedContext = {
        ...meta,
        session,
        user: session.user,
        tenantId: session.user.tenantId,
        permissions,
        can: (p) => permissions.has(p),
      };

      const required =
        def.permission === undefined ? [] : Array.isArray(def.permission) ? def.permission : [def.permission];
      const missing = required.filter((p) => !permissions.has(p));
      if (def.anyPermission?.length && !def.anyPermission.some((p) => permissions.has(p)))
        missing.push(...def.anyPermission);
      if ((def.portals && !def.portals.includes(session.portal)) || missing.length > 0) {
        await recordAudit({
          tenantId: ctx.tenantId,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'access.denied',
          entity: 'Route',
          entityId: `${req.method} ${new URL(req.url).pathname}`,
          outcome: 'denied',
          metadata: { missing, portal: session.portal },
          ...meta,
        });
        throw new AppError('FORBIDDEN', 'You do not have permission to do this');
      }

      const input = await parseInput(req, def.input, def.maxBodyBytes);
      const res = toResponse(await def.handler(ctx, { req, input, query, params }));
      if (session.renewed && res instanceof NextResponse && !res.cookies.get(SESSION_COOKIE)) {
        res.cookies.set(sessionCookie(readCookie(req, SESSION_COOKIE)!, session.expiresAt));
      }
      return res;
    } catch (err) {
      if (err instanceof AppError) return errorResponse(err, meta.requestId);
      console.error('Unhandled API error', { requestId: meta.requestId, err });
      await reportError(err, { requestId: meta.requestId, route: `${req.method} ${new URL(req.url).pathname}` });
      return errorResponse(new AppError('INTERNAL', 'Something went wrong. Please try again.'), meta.requestId);
    }
  };
}

/** Shared schemas. */
export const uuidParam = z.string().uuid('Invalid id');
export const paginationQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Reads a UUID route param; malformed ids are a 404 (indistinguishable from a missing record). */
export function idParam(params: Params, key = 'id'): string {
  const parsed = uuidParam.safeParse(params[key]);
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Not found');
  return parsed.data;
}
