import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withTenant } from '@/server/db/client';
import { auditInTx } from '@/server/audit/audit';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

export const listUsersQuery = z.object({
  role: z.enum(['SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSIONS_OFFICER', 'ACCOUNTANT', 'TEACHER', 'STUDENT']).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const baseSelect = {
  id: true,
  role: true,
  displayName: true,
  username: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/** Staff/user directory for the signed-in school. Tenant scoping is enforced by RLS, not by a where clause. */
export async function listSchoolUsers(ctx: AuthedContext, query: z.infer<typeof listUsersQuery>) {
  if (!ctx.tenantId) throw new AppError('FORBIDDEN', 'This action is only available to school accounts');
  // Email is only returned to the School Admin (needed for account management).
  const select = { ...baseSelect, email: ctx.user.role === 'SCHOOL_ADMIN' };
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.q
      ? {
          OR: [
            { displayName: { contains: query.q, mode: 'insensitive' } },
            { username: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const rows = await withTenant({ tenantId: ctx.tenantId, userId: ctx.user.id }, (tx) =>
    tx.user.findMany({
      where,
      select,
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
}

/**
 * Fetches one user. A cross-tenant id is invisible under RLS and yields 404 (indistinguishable from a
 * missing id). Every miss is audited so cross-tenant probing shows up in the school's audit log.
 */
export async function getSchoolUser(ctx: AuthedContext, id: string) {
  if (!ctx.tenantId) throw new AppError('FORBIDDEN', 'This action is only available to school accounts');
  const tenantId = ctx.tenantId;
  const select = { ...baseSelect, email: ctx.user.role === 'SCHOOL_ADMIN', mustChangePassword: true };
  const user = await withTenant({ tenantId, userId: ctx.user.id }, async (tx) => {
    const found = await tx.user.findFirst({ where: { id, deletedAt: null }, select });
    if (!found) {
      await auditInTx(tx, {
        tenantId,
        actorId: ctx.user.id,
        actorRole: ctx.user.role,
        action: 'access.not_found',
        entity: 'User',
        entityId: id,
        outcome: 'denied',
        requestId: ctx.requestId,
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      });
    }
    return found;
  });
  if (!user) throw notFound('User');
  return user;
}

export async function schoolUserCounts(ctx: AuthedContext) {
  if (!ctx.tenantId) return {};
  const groups = await withTenant({ tenantId: ctx.tenantId, userId: ctx.user.id }, (tx) =>
    tx.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
  );
  return Object.fromEntries(groups.map((g) => [g.role, g._count._all]));
}
