import 'server-only';
import { Prisma, type TenantStatus } from '@prisma/client';
import { z } from 'zod';
import { systemDb } from '@/server/db/system';
import { AppError, notFound } from '@/server/http/errors';
import { recordAudit } from '@/server/audit/audit';
import type { AuthedContext } from '@/server/http/route';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { PREFIX_PATTERN } from '@/server/auth/username';
import { revokeTenantSessions } from '@/server/auth/session';
import { startTrial } from '@/server/platform/plans';

/**
 * Platform console. Uses the privileged client because it is cross-tenant by nature, but it only ever
 * touches tenant METADATA and the first School Admin account, never student/teacher data (spec §2.7).
 */

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  prefix: z
    .string()
    .trim()
    .toLowerCase()
    .regex(PREFIX_PATTERN, 'Prefix must be 2–10 lowercase letters or digits, no spaces'),
  city: z.string().trim().max(80).optional(),
  admin: z.object({
    displayName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(200),
  }),
});

export const listTenantsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function listTenants(query: z.infer<typeof listTenantsQuery>) {
  const where: Prisma.TenantWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { prefix: { contains: query.q.toLowerCase() } },
            { city: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const rows = await systemDb().tenant.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      prefix: true,
      city: true,
      status: true,
      createdAt: true,
      suspendedAt: true,
      _count: { select: { users: true } },
      subscription: { select: { status: true, plan: { select: { name: true } } } },
    },
  });
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map(({ _count, subscription, ...t }) => ({
    ...t,
    userCount: _count.users,
    plan: subscription ? `${subscription.plan.name}${subscription.status === 'ACTIVE' ? '' : ` (${subscription.status.toLowerCase().replace('_', ' ')})`}` : null,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
}

export async function createTenant(ctx: AuthedContext, input: z.infer<typeof createTenantSchema>) {
  const db = systemDb();
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          prefix: input.prefix,
          city: input.city ?? null,
          status: 'TRIAL',
          settings: { create: {} },
        },
      });
      await startTrial(tx, tenant.id);
      const admin = await tx.user.create({
        data: {
          tenantId: tenant.id,
          role: 'SCHOOL_ADMIN',
          displayName: input.admin.displayName,
          email: input.admin.email,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true, email: true, displayName: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'tenant.create',
          entity: 'Tenant',
          entityId: tenant.id,
          after: { name: tenant.name, prefix: tenant.prefix, schoolAdminId: admin.id },
          requestId: ctx.requestId,
          ipHash: ctx.ipHash,
          userAgent: ctx.userAgent,
        },
      });
      return { tenant, admin };
    });
    // The temporary password is returned exactly once so the Platform Owner can relay it. It is never stored or logged.
    return { tenant: result.tenant, schoolAdmin: { ...result.admin, temporaryPassword } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = String((e.meta as { target?: unknown })?.target ?? '');
      throw new AppError(
        'CONFLICT',
        target.includes('email') ? 'That email is already in use' : 'That prefix is already taken',
        {
          field: target.includes('email') ? 'admin.email' : 'prefix',
        },
      );
    }
    throw e;
  }
}

export async function setTenantStatus(ctx: AuthedContext, tenantId: string, status: TenantStatus) {
  const db = systemDb();
  const before = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!before) throw notFound('School');
  const tenant = await db.tenant.update({
    where: { id: tenantId },
    data: { status, suspendedAt: status === 'SUSPENDED' ? new Date() : null },
  });
  // Suspension takes effect immediately: every session of every user at that school is revoked.
  const sessionsRevoked = status === 'SUSPENDED' ? await revokeTenantSessions(tenantId) : 0;
  await recordAudit({
    tenantId,
    actorId: ctx.user.id,
    actorRole: ctx.user.role,
    action: status === 'SUSPENDED' ? 'tenant.suspend' : 'tenant.status_change',
    entity: 'Tenant',
    entityId: tenantId,
    before: { status: before.status },
    after: { status },
    metadata: { sessionsRevoked },
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent,
  });
  return tenant;
}

export async function platformHealth() {
  const started = Date.now();
  let database: 'ok' | 'down' = 'ok';
  try {
    await systemDb().$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  const [tenants, users] =
    database === 'ok' ? await Promise.all([systemDb().tenant.count(), systemDb().user.count()]) : [0, 0];
  return { database, latencyMs: Date.now() - started, tenants, users, checkedAt: new Date().toISOString() };
}
