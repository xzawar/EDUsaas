import 'server-only';
import type { Invoice, InvoiceStatus, LateFeeRule as LateFeeRuleRow, Prisma } from '@prisma/client';
import { z } from 'zod';
import { applyDiscount, lateFee, type LateFeeRule } from '@/lib/money';
import { MONTH_PERIOD, isTermStart, termPeriod } from '@/lib/periods';
import { auditInTx } from '@/server/audit/audit';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { addDays, audit, inTenant, isoDate, schoolClock, sectionLabel, toDate } from '@/server/school/common';
import { nextNumber } from '@/server/school/finance/sequences';
import { applyAdvances } from '@/server/school/finance/payments';

/**
 * Invoices (Finance spec §2.2–2.3). One per student per period; lines come from the class fee structure, replaced by
 * per-student overrides and reduced by dated discounts. Late fee is live from the rule until the invoice is fully
 * paid, then frozen. Payments reach invoices through allocations (payments.ts).
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export function ruleOf(r: LateFeeRuleRow | null): LateFeeRule | null {
  return r
    ? {
        kind: r.kind,
        value: r.value,
        capPaisa: r.capPaisa === null ? null : Number(r.capPaisa),
        graceDays: r.graceDays,
      }
    : null;
}

export type InvoiceTotals = {
  subtotalPaisa: number;
  discountPaisa: number;
  lateFeePaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  overdue: boolean;
};

/** Pure: what an invoice is worth today. Frozen late fee wins; waived → 0; else live from the rule. */
export function invoiceTotals(
  inv: Pick<
    Invoice,
    'subtotalPaisa' | 'discountPaisa' | 'lateFeePaisa' | 'lateFeeWaived' | 'paidPaisa' | 'status' | 'dueOn'
  >,
  rule: LateFeeRule | null,
  today: string,
): InvoiceTotals {
  const subtotal = n(inv.subtotalPaisa);
  const discount = n(inv.discountPaisa);
  const paid = n(inv.paidPaisa);
  const base = subtotal - discount;
  const dueOn = isoDate(inv.dueOn)!;
  let late = 0;
  if (inv.lateFeeWaived || inv.status === 'VOID' || inv.status === 'WAIVED') late = 0;
  else if (inv.lateFeePaisa !== null) late = n(inv.lateFeePaisa);
  else if (rule && base > 0) late = lateFee(rule, base, dueOn, today);
  const total = base + late;
  return {
    subtotalPaisa: subtotal,
    discountPaisa: discount,
    lateFeePaisa: late,
    totalPaisa: total,
    paidPaisa: paid,
    balancePaisa: Math.max(0, total - paid),
    overdue: inv.status !== 'PAID' && inv.status !== 'VOID' && inv.status !== 'WAIVED' && today > dueOn,
  };
}

export async function yearRule(tx: TenantTx, academicYearId: string) {
  return ruleOf(await tx.lateFeeRule.findUnique({ where: { academicYearId } }));
}

/**
 * Recomputes paid/status from allocations. Freezes the late fee when the invoice becomes PAID; thaws it if a
 * reversal reopens the invoice (unless the fee was waived).
 */
export async function recomputeInvoice(tx: TenantTx, invoiceId: string, today: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status === 'VOID' || inv.status === 'WAIVED') return inv;
  const rule = await yearRule(tx, inv.academicYearId);
  const sum = await tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amountPaisa: true } });
  const paid = n(sum._sum.amountPaisa);
  const t = invoiceTotals({ ...inv, paidPaisa: BigInt(paid), status: 'DUE' }, rule, today);
  const status: InvoiceStatus = paid >= t.totalPaisa && t.totalPaisa >= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'DUE';
  const data: Prisma.InvoiceUpdateInput = { paidPaisa: BigInt(paid), status };
  if (status === 'PAID' && inv.lateFeePaisa === null && !inv.lateFeeWaived) data.lateFeePaisa = BigInt(t.lateFeePaisa);
  if (status !== 'PAID' && inv.status === 'PAID' && !inv.lateFeeWaived) data.lateFeePaisa = null;
  return tx.invoice.update({ where: { id: invoiceId }, data });
}

// ── Generation ────────────────────────────────────────────────────────────────

export const generateSchema = z.object({
  period: z.string().regex(MONTH_PERIOD, 'Period must be YYYY-MM'),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
});

type Discount = { feeHeadId: string | null; kind: 'PERCENT' | 'FIXED'; value: number };

function pickDiscount(discounts: Discount[], feeHeadId: string): Discount | null {
  return discounts.find((d) => d.feeHeadId === feeHeadId) ?? discounts.find((d) => d.feeHeadId === null) ?? null;
}

/**
 * Creates the month's invoices for every active, placed student of the current year (or one class / one student).
 * Idempotent: a student who already has an invoice for the period is skipped. Returns counts and the new ids.
 */
export async function generateInvoices(
  tx: TenantTx,
  tenantId: string,
  input: z.infer<typeof generateSchema> & { by: string | null },
) {
  const clock = await schoolClock(tx);
  const settings = await tx.tenantSettings.findFirstOrThrow({ select: { feeDueDays: true, termStartMonths: true } });
  const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
  if (!year) throw new AppError('VALIDATION_FAILED', 'Set a current academic year first');
  const month = Number(input.period.slice(5, 7));
  const termStart = isTermStart(month, settings.termStartMonths);
  const issuedOn = clock.today;
  const dueOn = addDays(issuedOn, settings.feeDueDays);

  const students = await tx.student.findMany({
    where: {
      status: 'ACTIVE',
      sectionId: { not: null },
      ...(input.studentId ? { id: input.studentId } : {}),
      section: { class: { academicYearId: year.id, ...(input.classId ? { id: input.classId } : {}) } },
    },
    select: { id: true, section: { select: { classId: true } } },
  });
  if (!students.length) return { created: 0, skipped: 0, ids: [] as string[] };

  const [structures, existing, overrides, discounts, onceLines] = await Promise.all([
    tx.feeStructure.findMany({
      where: { academicYearId: year.id, feeHead: { archivedAt: null } },
      include: { feeHead: { select: { id: true, name: true, kind: true } } },
    }),
    tx.invoice.findMany({
      where: { period: input.period, studentId: { in: students.map((s) => s.id) } },
      select: { studentId: true },
    }),
    tx.studentFeeOverride.findMany({ where: { studentId: { in: students.map((s) => s.id) } } }),
    tx.feeDiscount.findMany({
      where: {
        studentId: { in: students.map((s) => s.id) },
        validFrom: { lte: toDate(issuedOn) },
        OR: [{ validTo: null }, { validTo: { gte: toDate(issuedOn) } }],
      },
    }),
    tx.invoiceLine.findMany({
      where: {
        feeHead: { kind: 'ONCE' },
        invoice: { studentId: { in: students.map((s) => s.id) }, status: { not: 'VOID' } },
      },
      select: { feeHeadId: true, invoice: { select: { studentId: true } } },
    }),
  ]);
  const done = new Set(existing.map((e) => e.studentId));
  const byClass = new Map<string, typeof structures>();
  for (const s of structures) byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]);
  const overrideOf = new Map(overrides.map((o) => [`${o.studentId}:${o.feeHeadId}`, Number(o.amountPaisa)]));
  const discountsOf = new Map<string, Discount[]>();
  for (const d of discounts) discountsOf.set(d.studentId, [...(discountsOf.get(d.studentId) ?? []), d]);
  const onceDone = new Set(onceLines.map((l) => `${l.invoice.studentId}:${l.feeHeadId}`));

  let created = 0;
  let skipped = 0;
  const ids: string[] = [];
  for (const s of students) {
    if (done.has(s.id)) {
      skipped++;
      continue;
    }
    const rows = byClass.get(s.section!.classId) ?? [];
    const lines: { feeHeadId: string; description: string; amountPaisa: number; discountPaisa: number }[] = [];
    for (const r of rows) {
      if (r.feeHead.kind === 'TERM' && !termStart) continue;
      if (r.feeHead.kind === 'ONCE' && onceDone.has(`${s.id}:${r.feeHeadId}`)) continue;
      const amount = overrideOf.get(`${s.id}:${r.feeHeadId}`) ?? Number(r.amountPaisa);
      if (amount <= 0) continue;
      const d = pickDiscount(discountsOf.get(s.id) ?? [], r.feeHeadId);
      const discount = d ? applyDiscount(amount, d) : 0;
      const label =
        r.feeHead.kind === 'TERM'
          ? `${r.feeHead.name} (${termPeriod(`${input.period}-01`, settings.termStartMonths)})`
          : r.feeHead.name;
      lines.push({ feeHeadId: r.feeHeadId, description: label, amountPaisa: amount, discountPaisa: discount });
    }
    if (!lines.length) {
      skipped++;
      continue;
    }
    const subtotal = lines.reduce((a, l) => a + l.amountPaisa, 0);
    const discount = lines.reduce((a, l) => a + l.discountPaisa, 0);
    const inv = await tx.invoice.create({
      data: {
        tenantId,
        studentId: s.id,
        academicYearId: year.id,
        period: input.period,
        number: await nextNumber(tx, tenantId, 'INVOICE'),
        issuedOn: toDate(issuedOn),
        dueOn: toDate(dueOn),
        subtotalPaisa: BigInt(subtotal),
        discountPaisa: BigInt(discount),
        generatedBy: input.by,
        lines: {
          create: lines.map((l) => ({
            tenantId,
            feeHeadId: l.feeHeadId,
            description: l.description,
            amountPaisa: BigInt(l.amountPaisa),
            discountPaisa: BigInt(l.discountPaisa),
          })),
        },
      },
    });
    ids.push(inv.id);
    created++;
    await applyAdvances(tx, tenantId, s.id, clock.today);
  }
  return { created, skipped, ids };
}

export async function generateInvoicesFor(ctx: AuthedContext, input: z.infer<typeof generateSchema>) {
  return inTenant(ctx, async (tx) => {
    const r = await generateInvoices(tx, ctx.tenantId!, { ...input, by: ctx.user.id });
    await audit(ctx, tx, {
      action: 'invoice.generate',
      entity: 'Invoice',
      entityId: input.studentId ?? input.classId ?? input.period,
      after: { period: input.period, created: r.created, skipped: r.skipped },
    });
    return { created: r.created, skipped: r.skipped };
  });
}

/** Job entry point: one school, system actor. */
export async function generateInvoicesAsJob(tx: TenantTx, tenantId: string, period: string) {
  const r = await generateInvoices(tx, tenantId, { period, by: null });
  if (r.created > 0)
    await auditInTx(tx, {
      tenantId,
      actorId: null,
      actorRole: null,
      action: 'invoice.generate',
      entity: 'Invoice',
      entityId: period,
      after: { period, created: r.created, skipped: r.skipped, by: 'job' },
    });
  return r;
}

// ── Reading ───────────────────────────────────────────────────────────────────

export const listInvoicesQuery = z.object({
  status: z.enum(['DUE', 'PARTIAL', 'PAID', 'WAIVED', 'VOID', 'OPEN', 'OVERDUE']).optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  period: z.string().regex(MONTH_PERIOD).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const studentInclude = {
  student: {
    select: {
      id: true,
      rollNumber: true,
      guardianName: true,
      guardianPhone: true,
      user: { select: { displayName: true, username: true } },
      section: { include: { class: { select: { name: true } } } },
    },
  },
} satisfies Prisma.InvoiceInclude;

function summarise(
  inv: Invoice & { student: Prisma.StudentGetPayload<typeof studentInclude.student> },
  rule: LateFeeRule | null,
  today: string,
) {
  const t = invoiceTotals(inv, rule, today);
  return {
    id: inv.id,
    number: inv.number,
    period: inv.period,
    issuedOn: isoDate(inv.issuedOn)!,
    dueOn: isoDate(inv.dueOn)!,
    status: inv.status,
    ...t,
    student: {
      id: inv.student.id,
      name: inv.student.user.displayName,
      username: inv.student.user.username,
      rollNumber: inv.student.rollNumber,
      section: inv.student.section ? sectionLabel(inv.student.section) : null,
      guardianName: inv.student.guardianName,
      guardianPhone: inv.student.guardianPhone,
    },
  };
}

export async function listInvoices(ctx: AuthedContext, q: z.infer<typeof listInvoicesQuery>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) return { items: [], total: 0, page: 1, pages: 0 };
    const rule = await yearRule(tx, year.id);
    const where: Prisma.InvoiceWhereInput = {
      academicYearId: year.id,
      ...(q.period ? { period: q.period } : {}),
      ...(q.status === 'OPEN' || q.status === 'OVERDUE'
        ? {
            status: { in: ['DUE', 'PARTIAL'] },
            ...(q.status === 'OVERDUE' ? { dueOn: { lt: toDate(clock.today) } } : {}),
          }
        : q.status
          ? { status: q.status }
          : {}),
      ...(q.classId || q.sectionId
        ? {
            student: {
              section: { ...(q.sectionId ? { id: q.sectionId } : {}), ...(q.classId ? { classId: q.classId } : {}) },
            },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { number: { contains: q.q, mode: 'insensitive' } },
              { student: { user: { displayName: { contains: q.q, mode: 'insensitive' } } } },
              { student: { user: { username: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const PAGE = 50;
    const [total, rows] = await Promise.all([
      tx.invoice.count({ where }),
      tx.invoice.findMany({
        where,
        include: studentInclude,
        orderBy: [{ dueOn: 'desc' }, { number: 'desc' }],
        skip: (q.page - 1) * PAGE,
        take: PAGE,
      }),
    ]);
    return {
      items: rows.map((r) => summarise(r, rule, clock.today)),
      total,
      page: q.page,
      pages: Math.ceil(total / PAGE),
    };
  });
}

export async function invoiceDetail(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const inv = await tx.invoice.findUnique({
      where: { id },
      include: {
        ...studentInclude,
        lines: { include: { feeHead: { select: { name: true } } } },
        allocations: { include: { payment: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!inv) throw notFound('Invoice');
    // Students may only open their own.
    if (ctx.user.role === 'STUDENT') {
      const me = await tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });
      if (!me || me.id !== inv.studentId) throw notFound('Invoice');
    }
    const clock = await schoolClock(tx);
    const rule = await yearRule(tx, inv.academicYearId);
    return {
      ...summarise(inv, rule, clock.today),
      voidReason: inv.voidReason,
      lateFeeWaived: inv.lateFeeWaived,
      lines: inv.lines.map((l) => ({
        id: l.id,
        feeHead: l.feeHead.name,
        description: l.description,
        amountPaisa: n(l.amountPaisa),
        discountPaisa: n(l.discountPaisa),
      })),
      payments: inv.allocations.map((a) => ({
        paymentId: a.paymentId,
        receiptNumber: a.payment.receiptNumber,
        amountPaisa: n(a.amountPaisa),
        method: a.payment.method,
        reference: a.payment.reference,
        receivedOn: isoDate(a.payment.receivedOn)!,
        reversed: !!a.payment.reversedByPaymentId,
      })),
    };
  });
}

export async function voidInvoice(ctx: AuthedContext, id: string, reason: string) {
  return inTenant(ctx, async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id }, include: { _count: { select: { allocations: true } } } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'VOID') throw new AppError('CONFLICT', 'This bill is already cancelled');
    if (inv._count.allocations > 0 || n(inv.paidPaisa) > 0)
      throw new AppError('CONFLICT', 'A bill with payments cannot be cancelled. Reverse the payments first.');
    await tx.invoice.update({ where: { id }, data: { status: 'VOID', voidReason: reason, lateFeePaisa: 0n } });
    await audit(ctx, tx, {
      action: 'invoice.void',
      entity: 'Invoice',
      entityId: id,
      after: { reason, number: inv.number },
    });
    return { ok: true };
  });
}

export async function waiveLateFee(ctx: AuthedContext, id: string, reason: string) {
  return inTenant(ctx, async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id } });
    if (!inv) throw notFound('Invoice');
    if (inv.status === 'VOID') throw new AppError('CONFLICT', 'This bill is cancelled');
    await tx.invoice.update({ where: { id }, data: { lateFeeWaived: true, lateFeePaisa: 0n } });
    const clock = await schoolClock(tx);
    await recomputeInvoice(tx, id, clock.today);
    await audit(ctx, tx, {
      action: 'invoice.waive_late_fee',
      entity: 'Invoice',
      entityId: id,
      after: { reason, number: inv.number },
    });
    return { ok: true };
  });
}

// ── Per-student view (counter + student portal) ───────────────────────────────

export async function studentFeesIn(tx: TenantTx, studentId: string) {
  const clock = await schoolClock(tx);
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      rollNumber: true,
      status: true,
      guardianName: true,
      guardianPhone: true,
      user: { select: { displayName: true, username: true } },
      section: { include: { class: { select: { name: true } } } },
    },
  });
  if (!student) return null;
  const [invoices, payments, claims, rules] = await Promise.all([
    tx.invoice.findMany({
      where: { studentId },
      include: studentInclude,
      orderBy: [{ issuedOn: 'desc' }, { number: 'desc' }],
    }),
    tx.payment.findMany({
      where: { studentId },
      include: { allocations: { select: { invoiceId: true, amountPaisa: true } } },
      orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
    }),
    tx.paymentClaim.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    tx.lateFeeRule.findMany(),
  ]);
  const ruleByYear = new Map(rules.map((r) => [r.academicYearId, ruleOf(r)]));
  const items = invoices.map((inv) => summarise(inv, ruleByYear.get(inv.academicYearId) ?? null, clock.today));
  const outstanding = items
    .filter((i) => i.status === 'DUE' || i.status === 'PARTIAL')
    .reduce((a, i) => a + i.balancePaisa, 0);
  const advance = payments
    .filter((p) => !p.reversedByPaymentId && n(p.amountPaisa) > 0)
    .reduce((a, p) => a + n(p.amountPaisa) - p.allocations.reduce((b, x) => b + n(x.amountPaisa), 0), 0);
  return {
    student: {
      id: student.id,
      name: student.user.displayName,
      username: student.user.username,
      rollNumber: student.rollNumber,
      status: student.status,
      section: student.section ? sectionLabel(student.section) : null,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
    },
    outstandingPaisa: outstanding,
    advancePaisa: advance,
    invoices: items,
    payments: payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      amountPaisa: n(p.amountPaisa),
      method: p.method,
      reference: p.reference,
      receivedOn: isoDate(p.receivedOn)!,
      invoiceId: p.invoiceId,
      reversed: !!p.reversedByPaymentId,
      isReversal: !!p.reversesPaymentId,
      note: p.note,
    })),
    claims: claims.map((c) => ({
      id: c.id,
      invoiceId: c.invoiceId,
      amountPaisa: n(c.amountPaisa),
      method: c.method,
      reference: c.reference,
      paidOn: isoDate(c.paidOn)!,
      status: c.status,
      decisionNote: c.decisionNote,
      paymentId: c.paymentId,
      createdAt: c.createdAt,
    })),
  };
}

export async function studentFees(ctx: AuthedContext, studentId: string) {
  const r = await inTenant(ctx, async (tx) => {
    const fees = await studentFeesIn(tx, studentId);
    if (!fees)
      await audit(ctx, tx, { action: 'access.not_found', entity: 'Student', entityId: studentId, outcome: 'denied' });
    return fees;
  });
  if (!r) throw notFound('Student');
  return r;
}

export async function myFees(ctx: AuthedContext) {
  const r = await inTenant(ctx, async (tx) => {
    const me = await tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });
    return me ? studentFeesIn(tx, me.id) : null;
  });
  if (!r) throw notFound('Student record');
  return r;
}
