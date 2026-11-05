import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { revokeUserSessions } from '@/server/auth/session';
import { recordAudit } from '@/server/audit/audit';
import { PLATFORM_ADMIN_GRANTABLE, PERMISSIONS, type Permission } from '@/server/authz/permissions';
import { systemDb } from '@/server/db/system';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

/**
 * Platform Admin accounts (spec §2.7, §2.8): the Platform Owner creates them and switches on, per person, exactly
 * which operational permissions they get. They never get tenant data, tenant creation/deletion or billing.
 */

const meta = (ctx: AuthedContext) => ({ actorId: ctx.user.id, actorRole: ctx.user.role, requestId: ctx.requestId, ipHash: ctx.ipHash, userAgent: ctx.userAgent });

export async function platformAdminGrants(userId: string): Promise<Permission[]> {
  const rows = await systemDb().platformPermissionGrant.findMany({ where: { userId }, select: { permission: true } });
  const allowed = new Set<string>(PLATFORM_ADMIN_GRANTABLE);
  return rows.map((r) => r.permission).filter((p): p is Permission => allowed.has(p));
}

export async function listPlatformAdmins() {
  const users = await systemDb().user.findMany({
    where: { role: 'PLATFORM_ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayName: true, email: true, status: true, lastLoginAt: true, createdAt: true, platformGrants: { select: { permission: true } } },
  });
  return {
    grantable: PLATFORM_ADMIN_GRANTABLE.map((p) => ({ permission: p, label: PERMISSIONS[p] })),
    admins: users.map(({ platformGrants, ...u }) => ({ ...u, permissions: platformGrants.map((g) => g.permission) })),
  };
}

export const createPlatformAdminSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  permissions: z.array(z.enum(PLATFORM_ADMIN_GRANTABLE)).max(PLATFORM_ADMIN_GRANTABLE.length).default([]),
});

export async function createPlatformAdmin(ctx: AuthedContext, input: z.infer<typeof createPlatformAdminSchema>) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await systemDb().user.create({
      data: {
        tenantId: null,
        role: 'PLATFORM_ADMIN',
        displayName: input.displayName,
        email: input.email,
        passwordHash,
        mustChangePassword: true,
        platformGrants: { create: [...new Set(input.permissions)].map((permission) => ({ permission, grantedBy: ctx.user.id })) },
      },
      select: { id: true, displayName: true, email: true },
    });
    await recordAudit({ ...meta(ctx), action: 'platform_admin.create', entity: 'User', entityId: user.id, after: { email: user.email, permissions: input.permissions } });
    // Shown once to the Owner; never stored or logged.
    return { ...user, temporaryPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'That email is already in use');
    throw e;
  }
}

async function loadAdmin(id: string) {
  const u = await systemDb().user.findFirst({ where: { id, role: 'PLATFORM_ADMIN', deletedAt: null } });
  if (!u) throw notFound('Platform Admin');
  return u;
}

export const updatePlatformAdminSchema = z
  .object({
    permissions: z.array(z.enum(PLATFORM_ADMIN_GRANTABLE)).max(PLATFORM_ADMIN_GRANTABLE.length).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((v) => v.permissions !== undefined || v.status !== undefined, 'Nothing to change');

export async function updatePlatformAdmin(ctx: AuthedContext, id: string, input: z.infer<typeof updatePlatformAdminSchema>) {
  const before = await loadAdmin(id);
  const db = systemDb();
  const old = (await db.platformPermissionGrant.findMany({ where: { userId: id } })).map((g) => g.permission).sort();
  await db.$transaction(async (tx) => {
    if (input.permissions) {
      await tx.platformPermissionGrant.deleteMany({ where: { userId: id } });
      await tx.platformPermissionGrant.createMany({ data: [...new Set(input.permissions)].map((permission) => ({ userId: id, permission, grantedBy: ctx.user.id })) });
    }
    if (input.status) await tx.user.update({ where: { id }, data: { status: input.status } });
  });
  // Losing access takes effect at once (spec §3.4: sessions are revoked on deactivation).
  if (input.status === 'DISABLED') await revokeUserSessions(id);
  await recordAudit({
    ...meta(ctx),
    action: 'platform_admin.update',
    entity: 'User',
    entityId: id,
    before: { permissions: old, status: before.status },
    after: { permissions: input.permissions ? [...input.permissions].sort() : old, status: input.status ?? before.status },
  });
  return { ok: true };
}

export async function resetPlatformAdminPassword(ctx: AuthedContext, id: string) {
  await loadAdmin(id);
  const temporaryPassword = generateTemporaryPassword();
  await systemDb().user.update({
    where: { id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null },
  });
  await revokeUserSessions(id);
  await recordAudit({ ...meta(ctx), action: 'platform_admin.reset_password', entity: 'User', entityId: id });
  return { temporaryPassword };
}
