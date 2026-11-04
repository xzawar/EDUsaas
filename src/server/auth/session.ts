import 'server-only';
import type { Portal, TenantStatus, UserRole } from '@prisma/client';
import { systemDb } from '@/server/db/system';
import { env } from '@/server/env';
import { randomToken, sha256 } from '@/server/auth/password';

export const SESSION_COOKIE = 'edu_session';
/** Only write last_seen/expiry at most this often, to avoid a DB write on every request. */
const SLIDE_INTERVAL_MS = 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  role: UserRole;
  tenantId: string | null;
  displayName: string;
  username: string | null;
  email: string | null;
  mustChangePassword: boolean;
};

export type SessionContext = {
  sessionId: string;
  portal: Portal;
  expiresAt: Date;
  /** True when expiry was extended; route handlers then refresh the cookie. */
  renewed: boolean;
  user: SessionUser;
  tenant: { id: string; name: string; prefix: string; status: TenantStatus } | null;
};

const ttlMs = () => env().SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export async function createSession(input: {
  userId: string;
  tenantId: string | null;
  portal: Portal;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + ttlMs());
  await systemDb().session.create({
    data: {
      tokenHash: sha256(token),
      userId: input.userId,
      tenantId: input.tenantId,
      portal: input.portal,
      expiresAt,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
  return { token, expiresAt };
}

/** Validates a raw cookie token. Returns null for anything not fully valid (fail closed). */
export async function resolveSession(token: string | undefined | null): Promise<SessionContext | null> {
  if (!token || token.length > 200) return null;
  const db = systemDb();
  const row = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { tenant: { select: { id: true, name: true, prefix: true, status: true } } } } },
  });
  if (!row) return null;
  const now = Date.now();
  const u = row.user;
  const invalid =
    row.expiresAt.getTime() <= now ||
    u.status !== 'ACTIVE' ||
    u.deletedAt !== null ||
    (u.tenant !== null && u.tenant.status === 'SUSPENDED');
  if (invalid) {
    await db.session.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  let expiresAt = row.expiresAt;
  let renewed = false;
  if (now - row.lastSeenAt.getTime() > SLIDE_INTERVAL_MS) {
    expiresAt = new Date(now + ttlMs());
    renewed = true;
    await db.session
      .update({ where: { id: row.id }, data: { lastSeenAt: new Date(now), expiresAt } })
      .catch(() => undefined);
  }

  return {
    sessionId: row.id,
    portal: row.portal,
    expiresAt,
    renewed,
    user: {
      id: u.id,
      role: u.role,
      tenantId: u.tenantId,
      displayName: u.displayName,
      username: u.username,
      email: u.email,
      mustChangePassword: u.mustChangePassword,
    },
    tenant: u.tenant,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await systemDb().session.deleteMany({ where: { id: sessionId } });
}

/** Spec §3.4: on password change, role change or deactivation, delete the user's session rows. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const r = await systemDb().session.deleteMany({
    where: { userId, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
  });
  return r.count;
}

export async function revokeTenantSessions(tenantId: string): Promise<number> {
  const r = await systemDb().session.deleteMany({ where: { tenantId } });
  return r.count;
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie('', new Date(0)), maxAge: 0 };
}
