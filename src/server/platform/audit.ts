import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { systemDb } from '@/server/db/system';

/**
 * Platform-wide audit log (spec §2.7). Platform actions are shown in full. School actions are shown as metadata only
 * — which school, what kind of action, which role, when, outcome — never their before/after values or record ids,
 * so the console still never exposes a school's student or teacher data.
 */
export const platformAuditQuery = z.object({
  scope: z.enum(['platform', 'all']).default('platform'),
  tenantId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
});

export async function platformAudit(q: z.infer<typeof platformAuditQuery>) {
  const where: Prisma.AuditLogWhereInput = q.tenantId
    ? { tenantId: q.tenantId }
    : q.scope === 'platform'
      ? { OR: [{ tenantId: null }, { actorRole: { in: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'] } }] }
      : {};
  const rows = await systemDb().auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 51,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, 50);
  const tenantIds = [...new Set(page.map((r) => r.tenantId).filter(Boolean))] as string[];
  const actorIds = [
    ...new Set(
      page
        .filter((r) => r.actorRole === 'PLATFORM_OWNER' || r.actorRole === 'PLATFORM_ADMIN')
        .map((r) => r.actorId)
        .filter(Boolean),
    ),
  ] as string[];
  const [tenants, actors] = await Promise.all([
    systemDb().tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    systemDb().user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }),
  ]);
  const tn = new Map(tenants.map((t) => [t.id, t.name]));
  const an = new Map(actors.map((a) => [a.id, a.displayName]));
  return {
    items: page.map((r) => {
      const platformActor = r.actorRole === 'PLATFORM_OWNER' || r.actorRole === 'PLATFORM_ADMIN';
      const detail = !r.tenantId || platformActor;
      return {
        id: r.id,
        at: r.createdAt,
        action: r.action,
        outcome: r.outcome,
        school: r.tenantId ? (tn.get(r.tenantId) ?? 'Unknown school') : null,
        actor: platformActor ? (an.get(r.actorId ?? '') ?? 'Platform user') : null,
        actorRole: r.actorRole,
        support: !!r.supportGrantId,
        details: detail ? { before: r.before, after: r.after, metadata: r.metadata } : null,
      };
    }),
    nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
  };
}
