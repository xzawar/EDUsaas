import 'server-only';
import { z } from 'zod';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import type { TenantTx } from '@/server/db/client';
import { audit, friendlyDbError, inTenant, isoDate, schoolClock, toDate } from '@/server/school/common';

/**
 * Fee setup (Finance spec §2.2–2.3): fee heads, per-class amounts for a year, per-student overrides and discounts,
 * and the late-fee rule. Amounts are integer paisa. Everything here is per school (RLS) and audited.
 */

const paisa = z.number().int().min(0).max(1_000_000_000_00); // up to PKR 1,000,000,000

// ── Fee heads ─────────────────────────────────────────────────────────────────

export const feeHeadSchema = z.object({
  name: z.string().trim().min(2).max(60),
  kind: z.enum(['MONTHLY', 'TERM', 'ONCE']).default('MONTHLY'),
});

export const updateFeeHeadSchema = z
  .object({ name: z.string().trim().min(2).max(60).optional(), archived: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export async function listFeeHeads(ctx: AuthedContext, includeArchived = false) {
  return inTenant(ctx, (tx) =>
    tx.feeHead.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true, archivedAt: true },
    }),
  );
}

export async function createFeeHead(ctx: AuthedContext, input: z.infer<typeof feeHeadSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const clash = await tx.feeHead.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } });
      if (clash) throw new AppError('CONFLICT', 'A fee head with that name already exists', { field: 'name' });
      const head = await tx.feeHead.create({ data: { ...input, tenantId: ctx.tenantId! } });
      await audit(ctx, tx, { action: 'fee_head.create', entity: 'FeeHead', entityId: head.id, after: input });
      return head;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A fee head with that name already exists' });
  }
}

export async function updateFeeHead(ctx: AuthedContext, id: string, input: z.infer<typeof updateFeeHeadSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.feeHead.findUnique({ where: { id } });
      if (!before) throw notFound('Fee head');
      const head = await tx.feeHead.update({
        where: { id },
        data: {
          name: input.name,
          archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        },
      });
      await audit(ctx, tx, {
        action: 'fee_head.update',
        entity: 'FeeHead',
        entityId: id,
        before: { name: before.name, archived: !!before.archivedAt },
        after: { name: head.name, archived: !!head.archivedAt },
      });
      return head;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A fee head with that name already exists' });
  }
}

// ── Fee structure (year × class × head) ──────────────────────────────────────

export const feeStructureSchema = z.object({
  rows: z.array(z.object({ classId: z.string().uuid(), feeHeadId: z.string().uuid(), amountPaisa: paisa })).max(2000),
});

export async function feeStructure(ctx: AuthedContext, yearId: string) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: yearId }, select: { id: true, name: true } });
    if (!year) throw notFound('Academic year');
    const [classes, heads, rows] = await Promise.all([
      tx.class.findMany({
        where: { academicYearId: yearId },
        orderBy: { gradeLevel: 'asc' },
        select: { id: true, name: true, gradeLevel: true },
      }),
      tx.feeHead.findMany({
        where: { archivedAt: null },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, kind: true },
      }),
      tx.feeStructure.findMany({ where: { academicYearId: yearId } }),
    ]);
    const amounts: Record<string, Record<string, number>> = {};
    for (const r of rows) (amounts[r.classId] ??= {})[r.feeHeadId] = Number(r.amountPaisa);
    return { year, classes, heads, amounts };
  });
}

/** Upserts every row; an amount of 0 removes the row (that class doesn't pay that head). */
export async function saveFeeStructure(ctx: AuthedContext, yearId: string, input: z.infer<typeof feeStructureSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const year = await tx.academicYear.findUnique({ where: { id: yearId }, select: { id: true } });
      if (!year) throw notFound('Academic year');
      let saved = 0;
      let removed = 0;
      for (const r of input.rows) {
        if (r.amountPaisa === 0) {
          const del = await tx.feeStructure.deleteMany({
            where: { academicYearId: yearId, classId: r.classId, feeHeadId: r.feeHeadId },
          });
          removed += del.count;
        } else {
          await tx.feeStructure.upsert({
            where: {
              academicYearId_classId_feeHeadId: { academicYearId: yearId, classId: r.classId, feeHeadId: r.feeHeadId },
            },
            create: { tenantId: ctx.tenantId!, academicYearId: yearId, ...r, amountPaisa: BigInt(r.amountPaisa) },
            update: { amountPaisa: BigInt(r.amountPaisa) },
          });
          saved++;
        }
      }
      await audit(ctx, tx, {
        action: 'fee_structure.save',
        entity: 'AcademicYear',
        entityId: yearId,
        after: { saved, removed },
      });
      return { saved, removed };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

/** Copies a year's fee structure into another year, class by class name. */
export async function copyFeeStructure(ctx: AuthedContext, toYearId: string, fromYearId: string) {
  return inTenant(ctx, async (tx) => {
    const [from, to] = await Promise.all([
      tx.feeStructure.findMany({
        where: { academicYearId: fromYearId },
        include: { class: { select: { name: true } } },
      }),
      tx.class.findMany({ where: { academicYearId: toYearId }, select: { id: true, name: true } }),
    ]);
    const byName = new Map(to.map((c) => [c.name, c.id]));
    const rows = from
      .filter((r) => byName.has(r.class.name))
      .map((r) => ({ classId: byName.get(r.class.name)!, feeHeadId: r.feeHeadId, amountPaisa: Number(r.amountPaisa) }));
    let saved = 0;
    for (const r of rows) {
      await tx.feeStructure.upsert({
        where: {
          academicYearId_classId_feeHeadId: { academicYearId: toYearId, classId: r.classId, feeHeadId: r.feeHeadId },
        },
        create: { tenantId: ctx.tenantId!, academicYearId: toYearId, ...r, amountPaisa: BigInt(r.amountPaisa) },
        update: { amountPaisa: BigInt(r.amountPaisa) },
      });
      saved++;
    }
    await audit(ctx, tx, {
      action: 'fee_structure.copy',
      entity: 'AcademicYear',
      entityId: toYearId,
      after: { fromYearId, saved },
    });
    return { saved };
  });
}

// ── Late-fee rule ─────────────────────────────────────────────────────────────

export const lateFeeRuleSchema = z.object({
  graceDays: z.number().int().min(0).max(90).default(0),
  kind: z.enum(['FIXED', 'PERCENT', 'PER_DAY']).default('FIXED'),
  /** FIXED/PER_DAY: paisa. PERCENT: hundredths of a percent (500 = 5%). */
  value: z.number().int().min(0).max(1_000_000_00),
  capPaisa: paisa.nullable().default(null),
});

export async function lateFeeRule(ctx: AuthedContext, yearId: string) {
  return inTenant(ctx, async (tx) => {
    const r = await tx.lateFeeRule.findUnique({ where: { academicYearId: yearId } });
    return r
      ? {
          graceDays: r.graceDays,
          kind: r.kind,
          value: r.value,
          capPaisa: r.capPaisa === null ? null : Number(r.capPaisa),
        }
      : null;
  });
}

export async function saveLateFeeRule(ctx: AuthedContext, yearId: string, input: z.infer<typeof lateFeeRuleSchema>) {
  if (input.kind === 'PERCENT' && input.value > 10_000)
    throw new AppError('VALIDATION_FAILED', 'Percent cannot exceed 100%');
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: yearId }, select: { id: true } });
    if (!year) throw notFound('Academic year');
    const data = { ...input, capPaisa: input.capPaisa === null ? null : BigInt(input.capPaisa) };
    await tx.lateFeeRule.upsert({
      where: { academicYearId: yearId },
      create: { tenantId: ctx.tenantId!, academicYearId: yearId, ...data },
      update: data,
    });
    await audit(ctx, tx, { action: 'late_fee.update', entity: 'AcademicYear', entityId: yearId, after: input });
    return { ok: true };
  });
}

// ── Per-student overrides and discounts ───────────────────────────────────────

export const overrideSchema = z.object({
  feeHeadId: z.string().uuid(),
  amountPaisa: paisa,
  note: z.string().trim().max(200).optional(),
});

export const discountSchema = z.object({
  feeHeadId: z.string().uuid().nullable().default(null),
  kind: z.enum(['PERCENT', 'FIXED']),
  /** PERCENT: hundredths of a percent (1250 = 12.5%). FIXED: paisa. */
  value: z.number().int().min(1).max(1_000_000_00),
  reason: z.string().trim().min(2).max(120),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

const NOT_FOUND = Symbol('student-not-found');

/**
 * Runs fn for a student of this school. A miss (other school, or no such student) is audited as a blocked lookup
 * and surfaces as 404; the audit row commits because the throw happens after the transaction.
 */
async function withStudent<T>(ctx: AuthedContext, studentId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  const r = await inTenant(ctx, async (tx) => {
    const s = await tx.student.findUnique({ where: { id: studentId }, select: { id: true } });
    if (!s) {
      await audit(ctx, tx, { action: 'access.not_found', entity: 'Student', entityId: studentId, outcome: 'denied' });
      return NOT_FOUND;
    }
    return fn(tx);
  });
  if (r === NOT_FOUND) throw notFound('Student');
  return r as T;
}

export async function studentFeeConfig(ctx: AuthedContext, studentId: string) {
  return withStudent(ctx, studentId, async (tx) => {
    const [overrides, discounts] = await Promise.all([
      tx.studentFeeOverride.findMany({
        where: { studentId },
        include: { feeHead: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      tx.feeDiscount.findMany({
        where: { studentId },
        include: { feeHead: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      overrides: overrides.map((o) => ({
        id: o.id,
        feeHeadId: o.feeHeadId,
        feeHead: o.feeHead.name,
        amountPaisa: Number(o.amountPaisa),
        note: o.note,
      })),
      discounts: discounts.map((d) => ({
        id: d.id,
        feeHeadId: d.feeHeadId,
        feeHead: d.feeHead?.name ?? null,
        kind: d.kind,
        value: d.value,
        reason: d.reason,
        validFrom: isoDate(d.validFrom)!,
        validTo: isoDate(d.validTo),
      })),
    };
  });
}

export async function addOverride(ctx: AuthedContext, studentId: string, input: z.infer<typeof overrideSchema>) {
  try {
    return await withStudent(ctx, studentId, async (tx) => {
      const o = await tx.studentFeeOverride.upsert({
        where: { studentId_feeHeadId: { studentId, feeHeadId: input.feeHeadId } },
        create: { tenantId: ctx.tenantId!, studentId, ...input, amountPaisa: BigInt(input.amountPaisa) },
        update: { amountPaisa: BigInt(input.amountPaisa), note: input.note },
      });
      await audit(ctx, tx, { action: 'fee_override.set', entity: 'Student', entityId: studentId, after: input });
      return { id: o.id };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

export async function removeOverride(ctx: AuthedContext, studentId: string, overrideId: string) {
  return inTenant(ctx, async (tx) => {
    const o = await tx.studentFeeOverride.findFirst({ where: { id: overrideId, studentId } });
    if (!o) throw notFound('Override');
    await tx.studentFeeOverride.delete({ where: { id: overrideId } });
    await audit(ctx, tx, {
      action: 'fee_override.remove',
      entity: 'Student',
      entityId: studentId,
      before: { feeHeadId: o.feeHeadId, amountPaisa: Number(o.amountPaisa) },
    });
    return { ok: true };
  });
}

export async function addDiscount(ctx: AuthedContext, studentId: string, input: z.infer<typeof discountSchema>) {
  if (input.kind === 'PERCENT' && input.value > 10_000)
    throw new AppError('VALIDATION_FAILED', 'Percent cannot exceed 100%');
  if (input.validTo && input.validTo < input.validFrom)
    throw new AppError('VALIDATION_FAILED', 'End date is before the start');
  try {
    return await withStudent(ctx, studentId, async (tx) => {
      const d = await tx.feeDiscount.create({
        data: {
          tenantId: ctx.tenantId!,
          studentId,
          feeHeadId: input.feeHeadId,
          kind: input.kind,
          value: input.value,
          reason: input.reason,
          validFrom: toDate(input.validFrom),
          validTo: input.validTo ? toDate(input.validTo) : null,
          createdBy: ctx.user.id,
        },
      });
      await audit(ctx, tx, { action: 'discount.add', entity: 'Student', entityId: studentId, after: input });
      return { id: d.id };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

/** Discounts are never deleted (invoices already issued refer to them); ending one stops it from today. */
export async function endDiscount(ctx: AuthedContext, studentId: string, discountId: string) {
  return inTenant(ctx, async (tx) => {
    const d = await tx.feeDiscount.findFirst({ where: { id: discountId, studentId } });
    if (!d) throw notFound('Discount');
    const clock = await schoolClock(tx);
    const today = toDate(clock.today);
    const validTo = d.validFrom > today ? d.validFrom : today;
    await tx.feeDiscount.update({ where: { id: discountId }, data: { validTo } });
    await audit(ctx, tx, {
      action: 'discount.end',
      entity: 'Student',
      entityId: studentId,
      before: { reason: d.reason, validTo: isoDate(d.validTo) },
      after: { validTo: isoDate(validTo) },
    });
    return { ok: true };
  });
}
