import 'server-only';
import type { Portal } from '@prisma/client';
import { systemDb } from '@/server/db/system';
import { env } from '@/server/env';
import { AppError } from '@/server/http/errors';
import { recordAudit } from '@/server/audit/audit';
import { mailer } from '@/server/mail/mailer';
import { burnPasswordCheck, hashPassword, randomToken, sha256, verifyPassword } from '@/server/auth/password';
import { normalizeUsername } from '@/server/auth/username';
import { EMAIL_ROLES, PORTAL_HOME, PORTAL_ROLES } from '@/server/auth/portals';
import { createSession, revokeUserSessions } from '@/server/auth/session';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const RESET_TOKEN_MINUTES = 30;

type ReqMeta = { ipHash: string | null; userAgent: string | null; requestId: string };

const invalidCredentials = () => new AppError('INVALID_CREDENTIALS', 'Invalid username/email or password');

async function findLoginUser(identifier: string) {
  const raw = identifier.trim();
  const db = systemDb();
  const include = { tenant: { select: { status: true } } } as const;
  if (raw.includes('@')) {
    return db.user.findFirst({ where: { email: raw.toLowerCase(), deletedAt: null }, include });
  }
  const norm = normalizeUsername(raw);
  if (!norm) return null;
  return db.user.findFirst({ where: { usernameNormalized: norm, deletedAt: null }, include });
}

/**
 * Portal login (spec §3.1, decision D1). Order matters:
 * lock check → password verify (always, for timing) → failure counting → portal/role/status checks → session.
 */
export async function login(input: { portal: Portal; identifier: string; password: string }, meta: ReqMeta) {
  const db = systemDb();
  const user = await findLoginUser(input.identifier);

  if (!user) {
    await burnPasswordCheck(input.password);
    await recordAudit({
      action: 'auth.login',
      entity: 'User',
      outcome: 'failure',
      metadata: { portal: input.portal, reason: 'unknown_identifier' },
      ...meta,
    });
    throw invalidCredentials();
  }

  const auditBase = {
    tenantId: user.tenantId,
    actorId: user.id,
    actorRole: user.role,
    entity: 'User',
    entityId: user.id,
    ...meta,
  };

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await recordAudit({
      ...auditBase,
      action: 'auth.login',
      outcome: 'denied',
      metadata: { portal: input.portal, reason: 'locked' },
    });
    throw new AppError('ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const updated = await db.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    const lock = updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS;
    if (lock) {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
      });
    }
    await recordAudit({
      ...auditBase,
      action: 'auth.login',
      outcome: 'failure',
      metadata: { portal: input.portal, reason: 'bad_password', locked: lock },
    });
    throw invalidCredentials();
  }

  // Correct password from here on. Wrong portal / disabled / suspended all look identical to the client.
  const denyReason = !PORTAL_ROLES[input.portal].includes(user.role)
    ? 'wrong_portal'
    : user.status !== 'ACTIVE'
      ? 'account_disabled'
      : user.tenant?.status === 'SUSPENDED'
        ? 'tenant_suspended'
        : null;
  if (denyReason) {
    await recordAudit({
      ...auditBase,
      action: 'auth.login',
      outcome: 'denied',
      metadata: { portal: input.portal, reason: denyReason },
    });
    throw invalidCredentials();
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  const session = await createSession({
    userId: user.id,
    tenantId: user.tenantId,
    portal: input.portal,
    ipHash: meta.ipHash,
    userAgent: meta.userAgent,
  });
  await recordAudit({ ...auditBase, action: 'auth.login', metadata: { portal: input.portal } });

  return {
    ...session,
    redirectTo: user.mustChangePassword ? '/change-password' : PORTAL_HOME[input.portal],
    mustChangePassword: user.mustChangePassword,
  };
}

/** Changing a password revokes every session for the user and issues a fresh one for this device (spec §3.4). */
export async function changePassword(
  input: { userId: string; portal: Portal; currentPassword: string; newPassword: string },
  meta: ReqMeta,
) {
  const db = systemDb();
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await recordAudit({
      tenantId: user.tenantId,
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.password_change',
      entity: 'User',
      entityId: user.id,
      outcome: 'failure',
      ...meta,
    });
    throw new AppError('VALIDATION_FAILED', 'Current password is incorrect', { field: 'currentPassword' });
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError('VALIDATION_FAILED', 'New password must be different from the current one', {
      field: 'newPassword',
    });
  }
  if (user.usernameNormalized && normalizeUsername(input.newPassword) === user.usernameNormalized) {
    throw new AppError('VALIDATION_FAILED', 'Password must not be your username', { field: 'newPassword' });
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    },
  });
  const revoked = await revokeUserSessions(user.id);
  const session = await createSession({ userId: user.id, tenantId: user.tenantId, portal: input.portal, ...meta });
  await recordAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.password_change',
    entity: 'User',
    entityId: user.id,
    metadata: { sessionsRevoked: revoked },
    ...meta,
  });
  return { ...session, redirectTo: PORTAL_HOME[input.portal] };
}

/**
 * Email password reset for email-login roles (spec §3.5). The response never reveals whether the account exists.
 * Students and Teachers have no self-service reset: their School Admin resets them.
 */
export async function requestPasswordReset(input: { email: string; portal: Portal }, meta: ReqMeta): Promise<void> {
  const db = systemDb();
  const email = input.email.trim().toLowerCase();
  const user = await db.user.findFirst({
    where: { email, deletedAt: null },
    include: { tenant: { select: { status: true } } },
  });
  const eligible =
    user &&
    user.status === 'ACTIVE' &&
    EMAIL_ROLES.includes(user.role) &&
    PORTAL_ROLES[input.portal].includes(user.role) &&
    user.tenant?.status !== 'SUSPENDED';
  if (!eligible) {
    await recordAudit({
      action: 'auth.reset_request',
      entity: 'User',
      outcome: 'failure',
      metadata: { portal: input.portal },
      ...meta,
    });
    return;
  }
  const token = randomToken();
  await db.$transaction([
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
      },
    }),
  ]);
  const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await mailer().send({
    to: email,
    subject: 'Reset your EDUsaas password',
    text: `Use this link within ${RESET_TOKEN_MINUTES} minutes to set a new password:\n${link}\n\nIf you did not ask for this, ignore this email.`,
  });
  await recordAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.reset_request',
    entity: 'User',
    entityId: user.id,
    ...meta,
  });
}

export async function resetPassword(input: { token: string; newPassword: string }, meta: ReqMeta) {
  const db = systemDb();
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(input.token) },
    include: { user: true },
  });
  if (
    !row ||
    row.usedAt ||
    row.expiresAt.getTime() <= Date.now() ||
    row.user.status !== 'ACTIVE' ||
    row.user.deletedAt
  ) {
    throw new AppError('BAD_REQUEST', 'This reset link is invalid or has expired. Request a new one.');
  }
  // Single use: claim the token atomically before changing anything.
  const claimed = await db.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1)
    throw new AppError('BAD_REQUEST', 'This reset link is invalid or has expired. Request a new one.');

  await db.user.update({
    where: { id: row.userId },
    data: {
      passwordHash: await hashPassword(input.newPassword),
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  const revoked = await revokeUserSessions(row.userId);
  await recordAudit({
    tenantId: row.user.tenantId,
    actorId: row.userId,
    actorRole: row.user.role,
    action: 'auth.password_reset',
    entity: 'User',
    entityId: row.userId,
    metadata: { sessionsRevoked: revoked },
    ...meta,
  });
}

/** Daily cleanup (cron): expired sessions and reset tokens. */
export async function purgeExpiredCredentials() {
  const db = systemDb();
  const now = new Date();
  const [sessions, tokens] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
  ]);
  return { sessions: sessions.count, resetTokens: tokens.count };
}
