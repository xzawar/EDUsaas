import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Portal } from '@prisma/client';
import { SESSION_COOKIE, resolveSession, type SessionContext } from '@/server/auth/session';
import { PORTAL_HOME, PORTAL_LOGIN } from '@/server/auth/portals';
import { loadPermissions } from '@/server/authz/context';
import type { Permission } from '@/server/authz/permissions';
import type { AuthedContext } from '@/server/http/route';

async function pageMeta() {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return {
    requestId: crypto.randomUUID(),
    ipHash: ip ? crypto.createHash('sha256').update(`edusaas-ip:${ip}`).digest('hex').slice(0, 32) : null,
    userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
  };
}

/** Current session for server components, or null. Does not redirect. */
export async function currentSession(): Promise<SessionContext | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for a portal's app area. Redirects to that portal's login if there is no session, or if the session
 * belongs to a different portal (a student session can never open /staff pages, and vice versa).
 */
export async function requirePortal(portal: Portal, permission?: Permission): Promise<AuthedContext> {
  const session = await currentSession();
  if (!session || session.portal !== portal) redirect(PORTAL_LOGIN[portal]);
  if (session.user.mustChangePassword) redirect('/change-password');
  const permissions = await loadPermissions(session.user);
  if (permission && !permissions.has(permission)) redirect(PORTAL_HOME[portal]);
  return {
    ...(await pageMeta()),
    session,
    user: session.user,
    tenantId: session.user.tenantId,
    permissions,
    can: (p) => permissions.has(p),
  };
}
