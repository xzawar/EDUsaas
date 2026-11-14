import 'server-only';
import { z } from 'zod';
import { formatPKR } from '@/lib/money';
import { MONTH_PERIOD, monthBounds, periodLabel } from '@/lib/periods';
import type { TenantTx } from '@/server/db/client';
import { toCsv, type Cell } from '@/server/files/csv';
import { notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { inTenant, isoDate, schoolClock, sectionLabel, toDate } from '@/server/school/common';
import { invoiceTotals, ruleOf } from '@/server/school/finance/invoices';

/**
 * Finance reports (spec §2.3). Money figures come from the append-only ledger; bill figures from invoices.
 * Every report has a JSON shape for the screen and a CSV shape for Excel (formula-neutralised).
 */

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const reportQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  period: z.string().regex(MONTH_PERIOD).optional(),
  classId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  yearId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
type Q = z.infer<typeof reportQuery>;

// ── Daily collection ──────────────────────────────────────────────────────────

export async function dailyCollection(ctx: AuthedContext, q: Q) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const to = q.to ?? clock.today;
    const from = q.from ?? to;
    const [entries, payments] = await Promise.all([
      tx.ledgerEntry.findMany({
        where: {
          entryOn: { gte: toDate(from), lte: toDate(to) },
          kind: { in: ['FEE', 'ADVANCE', 'REVERSAL'] },
          refTable: 'payments',
        },
      }),
      tx.payment.findMany({
        where: { receivedOn: { gte: toDate(from), lte: toDate(to) } },
        include: {
          student: {
            select: {
              user: { select: { displayName: true } },
              section: { include: { class: { select: { name: true } } } },
            },
          },
        },
        orderBy: [{ receivedOn: 'asc' }, { receiptNumber: 'asc' }],
      }),
    ]);
    const byDay = new Map<
      string,
      { day: string; inPaisa: number; outPaisa: number; byMethod: Record<string, number> }
    >();
    for (const e of entries) {
      const day = isoDate(e.entryOn)!;
      const row = byDay.get(day) ?? { day, inPaisa: 0, outPaisa: 0, byMethod: {} };
      if (e.direction === 'IN') {
        row.inPaisa += n(e.amountPaisa);
        row.byMethod[e.method ?? 'OTHER'] = (row.byMethod[e.method ?? 'OTHER'] ?? 0) + n(e.amountPaisa);
      } else row.outPaisa += n(e.amountPaisa);
      byDay.set(day, row);
    }
    const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
    const receipts = payments.map((p) => ({
      id: p.id,
      receiptNumber: p.receiptNumber,
      receivedOn: isoDate(p.receivedOn)!,
      student: p.student.user.displayName,
      section: p.student.section ? sectionLabel(p.student.section) : null,
      amountPaisa: n(p.amountPaisa),
      method: p.method,
      reference: p.reference,
      reversed: !!p.reversedByPaymentId,
    }));
    return {
      from,
      to,
      days,
      totalInPaisa: days.reduce((a, d) => a + d.inPaisa, 0),
      totalOutPaisa: days.reduce((a, d) => a + d.outPaisa, 0),
      receipts,
    };
  });
}

export function dailyCollectionCsv(r: Awaited<ReturnType<typeof dailyCollection>>) {
  return toCsv(
    ['Date', 'Receipt', 'Student', 'Class', 'Method', 'Reference', 'Amount (PKR)', 'Reversed'],
    r.receipts.map(
      (x) =>
        [
          x.receivedOn,
          x.receiptNumber,
          x.student,
          x.section,
          x.method,
          x.reference,
          n(x.amountPaisa) / 100,
          x.reversed,
        ] as Cell[],
    ),
  );
}

// ── Defaulters ────────────────────────────────────────────────────────────────

export async function defaulters(ctx: AuthedContext, q: Q) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const asOf = q.to ?? clock.today;
    const rules = new Map((await tx.lateFeeRule.findMany()).map((r) => [r.academicYearId, ruleOf(r)]));
    const invoices = await tx.invoice.findMany({
      where: {
        status: { in: ['DUE', 'PARTIAL'] },
        dueOn: { lt: toDate(asOf) },
        student: { status: 'ACTIVE', ...(q.classId ? { section: { classId: q.classId } } : {}) },
      },
      include: {
        student: {
          select: {
            id: true,
            rollNumber: true,
            guardianName: true,
            guardianPhone: true,
            user: { select: { displayName: true, username: true } },
            section: { include: { class: { select: { name: true, gradeLevel: true } } } },
          },
        },
      },
    });
    const byStudent = new Map<
      string,
      { student: (typeof invoices)[number]['student']; bills: number; balancePaisa: number; oldestDue: string }
    >();
    for (const inv of invoices) {
      const t = invoiceTotals(inv, rules.get(inv.academicYearId) ?? null, asOf);
      const row = byStudent.get(inv.studentId) ?? {
        student: inv.student,
        bills: 0,
        balancePaisa: 0,
        oldestDue: isoDate(inv.dueOn)!,
      };
      row.bills++;
      row.balancePaisa += t.balancePaisa;
      if (isoDate(inv.dueOn)! < row.oldestDue) row.oldestDue = isoDate(inv.dueOn)!;
      byStudent.set(inv.studentId, row);
    }
    const rows = [...byStudent.values()]
      .filter((r) => r.balancePaisa > 0)
      .map((r) => ({
        studentId: r.student.id,
        name: r.student.user.displayName,
        username: r.student.user.username,
        section: r.student.section ? sectionLabel(r.student.section) : null,
        grade: r.student.section?.class.gradeLevel ?? 0,
        rollNumber: r.student.rollNumber,
        guardianName: r.student.guardianName,
        guardianPhone:
          ctx.user.role === 'SCHOOL_ADMIN' || ctx.user.role === 'ACCOUNTANT' ? r.student.guardianPhone : null,
        bills: r.bills,
        balancePaisa: r.balancePaisa,
        oldestDue: r.oldestDue,
      }))
      .sort(
        (a, b) =>
          a.grade - b.grade || (a.section ?? '').localeCompare(b.section ?? '') || b.balancePaisa - a.balancePaisa,
      );
    return { asOf, rows, totalPaisa: rows.reduce((a, r) => a + r.balancePaisa, 0), students: rows.length };
  });
}

export function defaultersCsv(r: Awaited<ReturnType<typeof defaulters>>) {
  return toCsv(
    ['Class', 'Roll no.', 'Student', 'Username', 'Guardian', 'Phone', 'Bills', 'Oldest due', 'Balance (PKR)'],
    r.rows.map(
      (x) =>
        [
          x.section,
          x.rollNumber,
          x.name,
          x.username,
          x.guardianName,
          x.guardianPhone,
          x.bills,
          x.oldestDue,
          x.balancePaisa / 100,
        ] as Cell[],
    ),
  );
}

// ── Income vs expense ─────────────────────────────────────────────────────────

async function yearFor(tx: TenantTx, yearId?: string) {
  const year = yearId
    ? await tx.academicYear.findUnique({ where: { id: yearId } })
    : await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
  if (!year) throw notFound('Academic year');
  return year;
}

export async function incomeExpense(ctx: AuthedContext, q: Q) {
  return inTenant(ctx, async (tx) => {
    const year = await yearFor(tx, q.yearId);
    const rows = await tx.$queryRaw<{ month: string; kind: string; direction: string; total: bigint }[]>`
      SELECT to_char(entry_on, 'YYYY-MM') AS month, kind::text AS kind, direction::text AS direction, SUM(amount_paisa) AS total
      FROM ledger_entries
      WHERE entry_on >= ${year.startsOn} AND entry_on <= ${year.endsOn}
      GROUP BY 1, 2, 3 ORDER BY 1`;
    const months = new Map<
      string,
      { month: string; feesPaisa: number; expensesPaisa: number; salariesPaisa: number; netPaisa: number }
    >();
    for (const r of rows) {
      const m = months.get(r.month) ?? {
        month: r.month,
        feesPaisa: 0,
        expensesPaisa: 0,
        salariesPaisa: 0,
        netPaisa: 0,
      };
      const amt = n(r.total);
      if (r.kind === 'FEE' || r.kind === 'ADVANCE') m.feesPaisa += amt;
      else if (r.kind === 'EXPENSE') m.expensesPaisa += amt;
      else if (r.kind === 'SALARY') m.salariesPaisa += amt;
      else if (r.kind === 'REVERSAL') {
        // A reversal undoes whatever it reversed: OUT reversals undo fee income, IN reversals undo expenses.
        if (r.direction === 'OUT') m.feesPaisa -= amt;
        else m.expensesPaisa -= amt;
      }
      m.netPaisa = m.feesPaisa - m.expensesPaisa - m.salariesPaisa;
      months.set(r.month, m);
    }
    const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    return {
      year: { id: year.id, name: year.name },
      months: list,
      totals: {
        feesPaisa: list.reduce((a, m) => a + m.feesPaisa, 0),
        expensesPaisa: list.reduce((a, m) => a + m.expensesPaisa, 0),
        salariesPaisa: list.reduce((a, m) => a + m.salariesPaisa, 0),
        netPaisa: list.reduce((a, m) => a + m.netPaisa, 0),
      },
    };
  });
}

export function incomeExpenseCsv(r: Awaited<ReturnType<typeof incomeExpense>>) {
  return toCsv(
    ['Month', 'Fees collected (PKR)', 'Expenses (PKR)', 'Salaries (PKR)', 'Net (PKR)'],
    r.months.map(
      (m) =>
        [
          periodLabel(m.month),
          m.feesPaisa / 100,
          m.expensesPaisa / 100,
          m.salariesPaisa / 100,
          m.netPaisa / 100,
        ] as Cell[],
    ),
  );
}

// ── Month summary ─────────────────────────────────────────────────────────────

export async function monthSummary(ctx: AuthedContext, q: Q) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const period = q.period ?? clock.today.slice(0, 7);
    const { from, to } = monthBounds(period);
    const range = { gte: toDate(from), lte: toDate(to) };
    const [invoiced, ledger, claims, expensesByCat] = await Promise.all([
      tx.invoice.aggregate({
        where: { period, status: { not: 'VOID' } },
        _sum: { subtotalPaisa: true, discountPaisa: true },
        _count: true,
      }),
      tx.ledgerEntry.groupBy({ by: ['kind', 'direction'], where: { entryOn: range }, _sum: { amountPaisa: true } }),
      tx.paymentClaim.count({ where: { status: 'PENDING' } }),
      tx.expense.groupBy({
        by: ['categoryId'],
        where: { spentOn: range, reversedByExpenseId: null, reversesExpenseId: null },
        _sum: { amountPaisa: true },
      }),
    ]);
    const get = (kind: string, direction: string) =>
      n(ledger.find((l) => l.kind === kind && l.direction === direction)?._sum.amountPaisa);
    const collected = get('FEE', 'IN') + get('ADVANCE', 'IN') - get('REVERSAL', 'OUT');
    const expenses = get('EXPENSE', 'OUT') - get('REVERSAL', 'IN');
    const salaries = get('SALARY', 'OUT');
    const cats = await tx.expenseCategory.findMany({
      where: { id: { in: expensesByCat.map((e) => e.categoryId) } },
      select: { id: true, name: true },
    });
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const rules = new Map((await tx.lateFeeRule.findMany()).map((r) => [r.academicYearId, ruleOf(r)]));
    const open = await tx.invoice.findMany({ where: { status: { in: ['DUE', 'PARTIAL'] } } });
    const outstanding = open.reduce(
      (a, inv) => a + invoiceTotals(inv, rules.get(inv.academicYearId) ?? null, clock.today).balancePaisa,
      0,
    );
    return {
      period,
      label: periodLabel(period),
      bills: invoiced._count,
      invoicedPaisa: n(invoiced._sum.subtotalPaisa) - n(invoiced._sum.discountPaisa),
      discountPaisa: n(invoiced._sum.discountPaisa),
      collectedPaisa: collected,
      expensesPaisa: expenses,
      salariesPaisa: salaries,
      netPaisa: collected - expenses - salaries,
      outstandingPaisa: outstanding,
      claimsPending: claims,
      expensesByCategory: expensesByCat
        .map((e) => ({ category: catName.get(e.categoryId) ?? 'Other', amountPaisa: n(e._sum.amountPaisa) }))
        .sort((a, b) => b.amountPaisa - a.amountPaisa),
    };
  });
}

export function monthSummaryCsv(r: Awaited<ReturnType<typeof monthSummary>>) {
  const rows: Cell[][] = [
    ['Month', r.label],
    ['Bills issued', r.bills],
    ['Billed (PKR)', r.invoicedPaisa / 100],
    ['Discounts (PKR)', r.discountPaisa / 100],
    ['Collected (PKR)', r.collectedPaisa / 100],
    ['Expenses (PKR)', r.expensesPaisa / 100],
    ['Salaries (PKR)', r.salariesPaisa / 100],
    ['Net (PKR)', r.netPaisa / 100],
    ['Outstanding, all time (PKR)', r.outstandingPaisa / 100],
    [],
    ['Expense category', 'Amount (PKR)'],
    ...r.expensesByCategory.map((e) => [e.category, e.amountPaisa / 100] as Cell[]),
  ];
  return toCsv(['Item', 'Value'], rows);
}

// ── Student ledger ────────────────────────────────────────────────────────────

export async function studentLedger(ctx: AuthedContext, studentId: string) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        rollNumber: true,
        user: { select: { displayName: true, username: true } },
        section: { include: { class: { select: { name: true } } } },
      },
    });
    if (!student) throw notFound('Student');
    const rules = new Map((await tx.lateFeeRule.findMany()).map((r) => [r.academicYearId, ruleOf(r)]));
    const [invoices, payments] = await Promise.all([
      tx.invoice.findMany({ where: { studentId, status: { not: 'VOID' } } }),
      tx.payment.findMany({ where: { studentId } }),
    ]);
    type Row = {
      date: string;
      kind: 'BILL' | 'LATE_FEE' | 'PAYMENT' | 'REVERSAL';
      label: string;
      debitPaisa: number;
      creditPaisa: number;
      ref: string;
    };
    const rows: Row[] = [];
    for (const inv of invoices) {
      const t = invoiceTotals(inv, rules.get(inv.academicYearId) ?? null, clock.today);
      rows.push({
        date: isoDate(inv.issuedOn)!,
        kind: 'BILL',
        label: `Fee bill ${periodLabel(inv.period)}`,
        debitPaisa: t.subtotalPaisa - t.discountPaisa,
        creditPaisa: 0,
        ref: inv.number,
      });
      if (t.lateFeePaisa > 0)
        rows.push({
          date: isoDate(inv.dueOn)!,
          kind: 'LATE_FEE',
          label: `Late fee on ${inv.number}`,
          debitPaisa: t.lateFeePaisa,
          creditPaisa: 0,
          ref: inv.number,
        });
    }
    for (const p of payments) {
      const amt = n(p.amountPaisa);
      if (amt > 0)
        rows.push({
          date: isoDate(p.receivedOn)!,
          kind: 'PAYMENT',
          label: `Payment by ${p.method}`,
          debitPaisa: 0,
          creditPaisa: amt,
          ref: p.receiptNumber,
        });
      else
        rows.push({
          date: isoDate(p.receivedOn)!,
          kind: 'REVERSAL',
          label: `Reversal: ${p.reversalReason ?? ''}`.trim(),
          debitPaisa: -amt,
          creditPaisa: 0,
          ref: p.receiptNumber,
        });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
    let balance = 0;
    const withBalance = rows.map((r) => {
      balance += r.debitPaisa - r.creditPaisa;
      return { ...r, balancePaisa: balance };
    });
    return {
      student: {
        id: student.id,
        name: student.user.displayName,
        username: student.user.username,
        rollNumber: student.rollNumber,
        section: student.section ? sectionLabel(student.section) : null,
      },
      rows: withBalance,
      balancePaisa: balance,
    };
  });
}

export function studentLedgerCsv(r: Awaited<ReturnType<typeof studentLedger>>) {
  return toCsv(
    ['Date', 'Ref', 'Description', 'Charged (PKR)', 'Paid (PKR)', 'Balance (PKR)'],
    r.rows.map(
      (x) => [x.date, x.ref, x.label, x.debitPaisa / 100, x.creditPaisa / 100, x.balancePaisa / 100] as Cell[],
    ),
  );
}

export const fmt = formatPKR;
