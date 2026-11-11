import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { MONTH_PERIOD, monthBounds } from '@/lib/periods';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, friendlyDbError, inTenant, isoDate, schoolClock, toDate } from '@/server/school/common';
import { salariesCategory } from '@/server/school/finance/expenses';
import { postLedger } from '@/server/school/finance/ledger';
import { METHODS } from '@/server/school/finance/payments';
import { nextNumber } from '@/server/school/finance/sequences';
import { notify } from '@/server/school/notifications';

/**
 * Payroll (Finance spec §2.2–2.3). A salary structure per staff user; a monthly run makes a draft payslip for each,
 * deducting approved unpaid leave (working days only), then finalise locks the amounts and paying writes the ledger.
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const line = z.object({
  name: z.string().trim().min(1).max(60),
  amountPaisa: z.number().int().min(0).max(1_000_000_000_00),
});
type Line = z.infer<typeof line>;

export const salaryStructureSchema = z.object({
  basicPaisa: z.number().int().min(0).max(1_000_000_000_00),
  allowances: z.array(line).max(20).default([]),
  deductions: z.array(line).max(20).default([]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  perDayDeduction: z.enum(['BASIC_30', 'NONE']).default('BASIC_30'),
});

const sum = (lines: Line[]) => lines.reduce((a, l) => a + l.amountPaisa, 0);

async function staffUser(tx: TenantTx, userId: string) {
  return tx.user.findFirst({
    where: { id: userId, role: { not: 'STUDENT' }, deletedAt: null },
    select: { id: true, displayName: true, role: true, status: true },
  });
}

export async function salaryStructure(ctx: AuthedContext, userId: string) {
  const r = await inTenant(ctx, async (tx) => {
    const user = await staffUser(tx, userId);
    if (!user) return null;
    const s = await tx.salaryStructure.findUnique({ where: { userId } });
    return {
      user,
      structure: s
        ? {
            basicPaisa: n(s.basicPaisa),
            allowances: s.allowances as Line[],
            deductions: s.deductions as Line[],
            effectiveFrom: isoDate(s.effectiveFrom)!,
            perDayDeduction: s.perDayDeduction,
            netPaisa: n(s.basicPaisa) + sum(s.allowances as Line[]) - sum(s.deductions as Line[]),
          }
        : null,
    };
  });
  if (!r) throw notFound('Staff member');
  return r;
}

export async function saveSalaryStructure(
  ctx: AuthedContext,
  userId: string,
  input: z.infer<typeof salaryStructureSchema>,
) {
  try {
    return await inTenant(ctx, async (tx) => {
      const user = await staffUser(tx, userId);
      if (!user) throw notFound('Staff member');
      const data = {
        basicPaisa: BigInt(input.basicPaisa),
        allowances: input.allowances,
        deductions: input.deductions,
        effectiveFrom: toDate(input.effectiveFrom),
        perDayDeduction: input.perDayDeduction,
        updatedBy: ctx.user.id,
      };
      const before = await tx.salaryStructure.findUnique({ where: { userId } });
      await tx.salaryStructure.upsert({
        where: { userId },
        create: { tenantId: ctx.tenantId!, userId, ...data },
        update: data,
      });
      await audit(ctx, tx, {
        action: 'salary.update',
        entity: 'User',
        entityId: userId,
        before: before ? { basicPaisa: n(before.basicPaisa) } : null,
        after: { basicPaisa: input.basicPaisa, allowances: sum(input.allowances), deductions: sum(input.deductions) },
      });
      return { ok: true };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

/** Lists every staff member with whether they have a structure (for the payroll setup page). */
export async function salaryRoster(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const users = await tx.user.findMany({
      where: { role: { not: 'STUDENT' }, deletedAt: null },
      orderBy: [{ role: 'asc' }, { displayName: 'asc' }],
      select: { id: true, displayName: true, role: true, status: true, salaryStructures: true },
    });
    return users.map((u) => {
      const s = u.salaryStructures[0];
      return {
        id: u.id,
        name: u.displayName,
        role: u.role,
        status: u.status,
        netPaisa: s ? n(s.basicPaisa) + sum(s.allowances as Line[]) - sum(s.deductions as Line[]) : null,
        effectiveFrom: s ? isoDate(s.effectiveFrom) : null,
      };
    });
  });
}

/** Working days of the school: the timetable's configured days, else Monday–Saturday. */
async function workingWeekdays(tx: TenantTx): Promise<number[]> {
  const slots = await tx.timetableSlot.findMany({ select: { dayOfWeek: true }, distinct: ['dayOfWeek'] });
  const days = slots.map((s) => s.dayOfWeek % 7); // 1..7 → JS getUTCDay (Sunday 0)
  return days.length ? days : [1, 2, 3, 4, 5, 6];
}

function countWorkingDays(from: string, to: string, weekdays: number[]) {
  let c = 0;
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000)
    if (weekdays.includes(new Date(d).getUTCDay())) c++;
  return c;
}

/** Approved unpaid-leave working days of one user inside a month. */
export async function unpaidLeaveDays(tx: TenantTx, userId: string, period: string, weekdays: number[]) {
  const { from, to } = monthBounds(period);
  const leaves = await tx.leaveRequest.findMany({
    where: {
      applicantId: userId,
      status: 'APPROVED',
      type: { paid: false },
      fromDate: { lte: toDate(to) },
      toDate: { gte: toDate(from) },
    },
    select: { fromDate: true, toDate: true },
  });
  let days = 0;
  for (const l of leaves) {
    const a = isoDate(l.fromDate)! < from ? from : isoDate(l.fromDate)!;
    const b = isoDate(l.toDate)! > to ? to : isoDate(l.toDate)!;
    days += countWorkingDays(a, b, weekdays);
  }
  return days;
}

export const runSchema = z.object({ period: z.string().regex(MONTH_PERIOD, 'Period must be YYYY-MM') });

export async function createPayrollRun(ctx: AuthedContext, input: z.infer<typeof runSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const tenantId = ctx.tenantId!;
      const { to } = monthBounds(input.period);
      const existing = await tx.payrollRun.findUnique({
        where: { tenantId_period: { tenantId, period: input.period } },
      });
      if (existing) throw new AppError('CONFLICT', `Payroll for ${input.period} already exists`);
      const structures = await tx.salaryStructure.findMany({
        where: {
          effectiveFrom: { lte: toDate(to) },
          user: { status: 'ACTIVE', deletedAt: null, role: { not: 'STUDENT' } },
        },
        include: { user: { select: { id: true, displayName: true } } },
      });
      const weekdays = await workingWeekdays(tx);
      const run = await tx.payrollRun.create({ data: { tenantId, period: input.period, runBy: ctx.user.id } });
      let total = 0;
      for (const s of structures) {
        const allowances = s.allowances as Line[];
        const deductions = s.deductions as Line[];
        const unpaid = await unpaidLeaveDays(tx, s.userId, input.period, weekdays);
        const leaveDeduction = s.perDayDeduction === 'BASIC_30' ? Math.round((n(s.basicPaisa) / 30) * unpaid) : 0;
        const net = Math.max(0, n(s.basicPaisa) + sum(allowances) - sum(deductions) - leaveDeduction);
        await tx.payslip.create({
          data: {
            tenantId,
            payrollRunId: run.id,
            userId: s.userId,
            number: await nextNumber(tx, tenantId, 'PAYSLIP'),
            basicPaisa: s.basicPaisa,
            allowances,
            deductions,
            allowancesPaisa: BigInt(sum(allowances)),
            deductionsPaisa: BigInt(sum(deductions)),
            unpaidLeaveDays: unpaid,
            leaveDeductionPaisa: BigInt(leaveDeduction),
            netPaisa: BigInt(net),
          },
        });
        total += net;
      }
      await tx.payrollRun.update({ where: { id: run.id }, data: { totalPaisa: BigInt(total) } });
      await audit(ctx, tx, {
        action: 'payroll.run',
        entity: 'PayrollRun',
        entityId: run.id,
        after: { period: input.period, staff: structures.length, totalPaisa: total },
      });
      return { id: run.id, period: input.period, staff: structures.length, totalPaisa: total };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

const slipView = (
  p: Prisma.PayslipGetPayload<{ include: { user: { select: { displayName: true; role: true } } } }>,
) => ({
  id: p.id,
  number: p.number,
  userId: p.userId,
  name: p.user.displayName,
  role: p.user.role,
  basicPaisa: n(p.basicPaisa),
  allowances: p.allowances as Line[],
  deductions: p.deductions as Line[],
  allowancesPaisa: n(p.allowancesPaisa),
  deductionsPaisa: n(p.deductionsPaisa),
  unpaidLeaveDays: p.unpaidLeaveDays,
  leaveDeductionPaisa: n(p.leaveDeductionPaisa),
  netPaisa: n(p.netPaisa),
  paidOn: isoDate(p.paidOn),
  method: p.method,
  reference: p.reference,
});

export async function listPayrollRuns(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const runs = await tx.payrollRun.findMany({
      orderBy: { period: 'desc' },
      include: { _count: { select: { payslips: true } } },
      take: 36,
    });
    return runs.map((r) => ({
      id: r.id,
      period: r.period,
      status: r.status,
      totalPaisa: n(r.totalPaisa),
      staff: r._count.payslips,
      finalisedAt: r.finalisedAt,
      createdAt: r.createdAt,
    }));
  });
}

export async function payrollRun(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: { include: { user: { select: { displayName: true, role: true } } }, orderBy: { number: 'asc' } },
      },
    });
    if (!run) throw notFound('Payroll run');
    return {
      id: run.id,
      period: run.period,
      status: run.status,
      totalPaisa: n(run.totalPaisa),
      finalisedAt: run.finalisedAt,
      payslips: run.payslips.map(slipView),
      paidPaisa: run.payslips.filter((p) => p.paidOn).reduce((a, p) => a + n(p.netPaisa), 0),
    };
  });
}

export async function finaliseRun(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const run = await tx.payrollRun.findUnique({
      where: { id },
      include: { payslips: { select: { userId: true, number: true, netPaisa: true } } },
    });
    if (!run) throw notFound('Payroll run');
    if (run.status !== 'DRAFT') throw new AppError('CONFLICT', 'This payroll is already finalised');
    if (!run.payslips.length) throw new AppError('CONFLICT', 'Nothing to finalise: no staff has a salary set');
    await tx.payrollRun.update({ where: { id }, data: { status: 'FINALISED', finalisedAt: new Date() } });
    await audit(ctx, tx, {
      action: 'payroll.finalise',
      entity: 'PayrollRun',
      entityId: id,
      after: { period: run.period, totalPaisa: n(run.totalPaisa) },
    });
    await notify(
      tx,
      ctx.tenantId!,
      run.payslips.map((p) => p.userId),
      {
        kind: 'payslip.ready',
        title: `Payslip ready for ${run.period}`,
        body: 'Your payslip for the month is ready to view.',
        link: '/staff/payslips',
      },
    );
    return { ok: true };
  });
}

export const paySchema = z.object({
  payslipIds: z.array(z.string().uuid()).max(500).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.enum(METHODS),
  reference: z.string().trim().max(80).optional(),
});

/** Marks payslips paid: one SALARY ledger entry each, and one "Salaries" expense voucher for the total. */
export async function payRun(ctx: AuthedContext, id: string, input: z.infer<typeof paySchema>) {
  return inTenant(ctx, async (tx) => {
    const tenantId = ctx.tenantId!;
    const run = await tx.payrollRun.findUnique({ where: { id }, include: { payslips: true } });
    if (!run) throw notFound('Payroll run');
    if (run.status === 'DRAFT') throw new AppError('CONFLICT', 'Finalise the payroll before paying');
    const clock = await schoolClock(tx);
    if (input.paidOn > clock.today) throw new AppError('VALIDATION_FAILED', 'Paid date cannot be in the future');
    const targets = run.payslips.filter((p) => !p.paidOn && (!input.payslipIds || input.payslipIds.includes(p.id)));
    if (!targets.length) throw new AppError('CONFLICT', 'Those payslips are already paid');
    let total = 0;
    for (const p of targets) {
      await tx.payslip.update({
        where: { id: p.id },
        data: { paidOn: toDate(input.paidOn), method: input.method, reference: input.reference || null },
      });
      if (n(p.netPaisa) > 0) {
        await postLedger(tx, {
          tenantId,
          entryOn: input.paidOn,
          kind: 'SALARY',
          direction: 'OUT',
          amountPaisa: p.netPaisa,
          method: input.method,
          refTable: 'payslips',
          refId: p.id,
          userId: p.userId,
          createdBy: ctx.user.id,
        });
        total += n(p.netPaisa);
      }
    }
    if (total > 0) {
      const categoryId = await salariesCategory(tx, tenantId);
      await tx.expense.create({
        data: {
          tenantId,
          categoryId,
          amountPaisa: BigInt(total),
          spentOn: toDate(input.paidOn),
          paidTo: `Staff salaries ${run.period} (${targets.length})`,
          method: input.method,
          voucherNumber: await nextNumber(tx, tenantId, 'VOUCHER'),
          reference: input.reference || null,
          note: `Payroll ${run.period}`,
          enteredBy: ctx.user.id,
        },
      });
    }
    const remaining = await tx.payslip.count({ where: { payrollRunId: id, paidOn: null } });
    if (remaining === 0) await tx.payrollRun.update({ where: { id }, data: { status: 'PAID' } });
    await audit(ctx, tx, {
      action: 'payroll.pay',
      entity: 'PayrollRun',
      entityId: id,
      after: { period: run.period, payslips: targets.length, totalPaisa: total, method: input.method },
    });
    return { paid: targets.length, totalPaisa: total, status: remaining === 0 ? 'PAID' : 'FINALISED' };
  });
}

export async function deleteDraftRun(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id } });
    if (!run) throw notFound('Payroll run');
    if (run.status !== 'DRAFT') throw new AppError('CONFLICT', 'Only a draft payroll can be deleted');
    // Draft payslips are not money rows yet; the DELETE grant is revoked for payslips, so remove via the run cascade.
    await tx.$executeRaw`DELETE FROM payroll_runs WHERE id = ${id}::uuid`;
    await audit(ctx, tx, {
      action: 'payroll.delete',
      entity: 'PayrollRun',
      entityId: id,
      before: { period: run.period },
    });
    return { ok: true };
  });
}

export async function myPayslips(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const rows = await tx.payslip.findMany({
      where: { userId: ctx.user.id, run: { status: { not: 'DRAFT' } } },
      include: { user: { select: { displayName: true, role: true } }, run: { select: { period: true } } },
      orderBy: { number: 'desc' },
      take: 24,
    });
    return rows.map((p) => ({ ...slipView(p), period: p.run.period }));
  });
}

/** A payslip with school and period: the owner, or payroll staff. Draft payslips are hidden from owners. */
export async function payslipForPdf(ctx: AuthedContext, id: string) {
  const r = await inTenant(ctx, async (tx) => {
    const p = await tx.payslip.findUnique({
      where: { id },
      include: { user: { select: { displayName: true, role: true } }, run: { select: { period: true, status: true } } },
    });
    if (!p) return null;
    const own = p.userId === ctx.user.id;
    if (!own && !ctx.can('payroll.manage')) return null;
    if (own && !ctx.can('payroll.manage') && p.run.status === 'DRAFT') return null;
    const tenant = await tx.tenant.findFirstOrThrow({ select: { name: true, city: true } });
    return { slip: slipView(p), period: p.run.period, status: p.run.status, school: tenant };
  });
  if (!r) throw notFound('Payslip');
  return r;
}
