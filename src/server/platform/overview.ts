import 'server-only';
import { systemDb } from '@/server/db/system';
import { usageFor } from '@/server/platform/plans';

/**
 * Business overview for the Platform Console home: schools by status, subscriptions and monthly revenue, schools
 * close to their plan limits, and support work waiting. Metadata and counts only, never school records.
 */
export async function platformOverview() {
  const db = systemDb();
  const [tenants, subs, openTickets, awaiting, withoutPlan] = await Promise.all([
    db.tenant.groupBy({ by: ['status'], _count: true }),
    db.subscription.findMany({
      include: { plan: true, tenant: { select: { id: true, name: true, status: true } } },
    }),
    db.supportTicket.count({ where: { status: 'OPEN' } }),
    db.supportGrant.count({ where: { status: 'AWAITING_OWNER' } }),
    db.tenant.findMany({
      where: { status: { not: 'SUSPENDED' }, subscription: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  const byStatus = Object.fromEntries(tenants.map((t) => [t.status, t._count])) as Record<string, number>;
  const live = subs.filter((s) => s.tenant.status !== 'SUSPENDED');
  const usage = await usageFor(live.map((s) => s.tenantId));
  const nearLimit = live
    .map((s) => {
      const u = usage.get(s.tenantId)!;
      const ratios = [
        s.plan.maxStudents ? u.students / s.plan.maxStudents : 0,
        s.plan.maxStaff ? u.staff / s.plan.maxStaff : 0,
      ];
      return {
        id: s.tenantId,
        name: s.tenant.name,
        plan: s.plan.name,
        students: u.students,
        maxStudents: s.plan.maxStudents,
        staff: u.staff,
        maxStaff: s.plan.maxStaff,
        ratio: Math.max(...ratios),
      };
    })
    .filter((s) => s.ratio >= 0.85)
    .sort((a, b) => b.ratio - a.ratio);
  const count = (st: string) => live.filter((s) => s.status === st).length;
  return {
    schools: {
      total: tenants.reduce((n, t) => n + t._count, 0),
      active: byStatus.ACTIVE ?? 0,
      trial: byStatus.TRIAL ?? 0,
      suspended: byStatus.SUSPENDED ?? 0,
    },
    subscriptions: {
      active: count('ACTIVE'),
      trial: count('TRIAL'),
      pastDue: count('PAST_DUE'),
      cancelled: count('CANCELLED'),
    },
    withoutPlan,
    monthlyRevenue: live.filter((s) => s.status === 'ACTIVE').reduce((n, s) => n + s.plan.priceMonthly, 0),
    pastDue: live
      .filter((s) => s.status === 'PAST_DUE')
      .map((s) => ({ id: s.tenantId, name: s.tenant.name, plan: s.plan.name })),
    nearLimit,
    openTickets,
    awaitingOwner: awaiting,
  };
}
