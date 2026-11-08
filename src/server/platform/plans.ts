import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { recordAudit } from '@/server/audit/audit';
import { systemDb } from '@/server/db/system';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';

/**
 * Plans & subscriptions (spec §2.7, §8 "SaaS"). The Platform Owner defines plans (price, student/staff limits) and
 * puts each school on one. Usage is counted live from the school's own tables, and limits are enforced when a
 * school adds students or staff, with a clear message instead of a silent failure.
 */

const meta = (ctx: AuthedContext) => ({
  actorId: ctx.user.id,
  actorRole: ctx.user.role,
  requestId: ctx.requestId,
  ipHash: ctx.ipHash,
  userAgent: ctx.userAgent,
});

export const planSchema = z.object({
  name: z.string().trim().min(2).max(60),
  priceMonthly: z.number().int().min(0).max(10_000_000),
  maxStudents: z.number().int().min(1).max(100_000).nullable(),
  maxStaff: z.number().int().min(1).max(10_000).nullable(),
  active: z.boolean().default(true),
});

export async function listPlans() {
  const plans = await systemDb().plan.findMany({
    orderBy: [{ active: 'desc' }, { priceMonthly: 'asc' }],
    include: { _count: { select: { subscriptions: true } } },
  });
  return plans.map(({ _count, ...p }) => ({ ...p, schools: _count.subscriptions }));
}

export async function createPlan(ctx: AuthedContext, input: z.infer<typeof planSchema>) {
  try {
    const plan = await systemDb().plan.create({ data: input });
    await recordAudit({ ...meta(ctx), action: 'plan.create', entity: 'Plan', entityId: plan.id, after: input });
    return plan;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError('CONFLICT', 'A plan with that name already exists');
    throw e;
  }
}

export async function updatePlan(ctx: AuthedContext, id: string, input: z.infer<typeof planSchema>) {
  const before = await systemDb().plan.findUnique({ where: { id } });
  if (!before) throw notFound('Plan');
  try {
    const plan = await systemDb().plan.update({ where: { id }, data: input });
    await recordAudit({ ...meta(ctx), action: 'plan.update', entity: 'Plan', entityId: id, before, after: input });
    return plan;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError('CONFLICT', 'A plan with that name already exists');
    throw e;
  }
}

/** Live usage for one school (or many): active students and active staff accounts. */
export async function usageFor(tenantIds: string[]) {
  const db = systemDb();
  const [students, staff] = await Promise.all([
    db.student.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds }, status: 'ACTIVE' }, _count: true }),
    db.user.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds }, role: { not: 'STUDENT' }, status: 'ACTIVE', deletedAt: null },
      _count: true,
    }),
  ]);
  const s = new Map(students.map((r) => [r.tenantId, r._count]));
  const t = new Map(staff.map((r) => [r.tenantId!, r._count]));
  return new Map(tenantIds.map((id) => [id, { students: s.get(id) ?? 0, staff: t.get(id) ?? 0 }]));
}

export async function tenantSubscription(tenantId: string) {
  const db = systemDb();
  const [sub, usage] = await Promise.all([
    db.subscription.findUnique({ where: { tenantId }, include: { plan: true } }),
    usageFor([tenantId]),
  ]);
  return { subscription: sub, usage: usage.get(tenantId)! };
}

export const subscriptionSchema = z.object({
  planId: z.string().uuid(),
  status: z.enum(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED']),
  renewsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function setSubscription(ctx: AuthedContext, tenantId: string, input: z.infer<typeof subscriptionSchema>) {
  const db = systemDb();
  if (!(await db.tenant.findUnique({ where: { id: tenantId } }))) throw notFound('School');
  const plan = await db.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw notFound('Plan');
  const before = await db.subscription.findUnique({
    where: { tenantId },
    include: { plan: { select: { name: true } } },
  });
  const data = {
    planId: plan.id,
    status: input.status,
    renewsOn: input.renewsOn ? new Date(`${input.renewsOn}T00:00:00Z`) : null,
    notes: input.notes ?? null,
  };
  await db.subscription.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await recordAudit({
    ...meta(ctx),
    tenantId,
    action: 'subscription.change',
    entity: 'Subscription',
    entityId: tenantId,
    before: before ? { plan: before.plan.name, status: before.status } : null,
    after: { plan: plan.name, status: input.status },
  });
  return { ok: true };
}

/** Puts a new school on the cheapest active plan as a trial (if any plan exists). */
export async function startTrial(tx: Prisma.TransactionClient, tenantId: string) {
  const plan = await tx.plan.findFirst({ where: { active: true }, orderBy: { priceMonthly: 'asc' } });
  if (plan) await tx.subscription.create({ data: { tenantId, planId: plan.id, status: 'TRIAL' } });
}

/**
 * Called before a school adds students or staff. A cancelled subscription, or going over the plan's limit, is refused
 * with a message the School Admin can act on. Schools without a subscription (e.g. before plans exist) aren't limited.
 */
export async function assertWithinPlan(tenantId: string, kind: 'students' | 'staff', adding = 1) {
  const db = systemDb();
  const sub = await db.subscription.findUnique({ where: { tenantId }, include: { plan: true } });
  if (!sub) return;
  if (sub.status === 'CANCELLED')
    throw new AppError(
      'CONFLICT',
      'Your school’s EDUsaas subscription is cancelled. Contact EDUsaas support to reactivate it.',
    );
  const limit = kind === 'students' ? sub.plan.maxStudents : sub.plan.maxStaff;
  if (limit === null) return;
  const used = (await usageFor([tenantId])).get(tenantId)![kind];
  if (used + adding > limit) {
    throw new AppError(
      'CONFLICT',
      `Your plan (${sub.plan.name}) allows ${limit} active ${kind === 'students' ? 'students' : 'staff accounts'}; you have ${used}. Ask EDUsaas support to move you to a bigger plan.`,
    );
  }
}
