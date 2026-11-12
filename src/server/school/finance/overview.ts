import 'server-only';
import type { AuthedContext } from '@/server/http/route';
import { inTenant, schoolClock, toDate } from '@/server/school/common';
import { invoiceTotals, ruleOf } from '@/server/school/finance/invoices';

const n = (v: bigint | number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

/** The numbers on the finance dashboard and the School Admin's finance card. */
export async function financeOverview(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const month = clock.today.slice(0, 7);
    const monthRange = { gte: toDate(`${month}-01`), lte: toDate(clock.today) };
    const [todayIn, monthLedger, claims, open, rules, invoiced, recent] = await Promise.all([
      tx.ledgerEntry.groupBy({
        by: ['direction'],
        where: { entryOn: toDate(clock.today), refTable: 'payments' },
        _sum: { amountPaisa: true },
      }),
      tx.ledgerEntry.groupBy({
        by: ['kind', 'direction'],
        where: { entryOn: monthRange },
        _sum: { amountPaisa: true },
      }),
      tx.paymentClaim.count({ where: { status: 'PENDING' } }),
      tx.invoice.findMany({
        where: { status: { in: ['DUE', 'PARTIAL'] } },
        select: {
          academicYearId: true,
          subtotalPaisa: true,
          discountPaisa: true,
          lateFeePaisa: true,
          lateFeeWaived: true,
          paidPaisa: true,
          status: true,
          dueOn: true,
          studentId: true,
        },
      }),
      tx.lateFeeRule.findMany(),
      tx.invoice.aggregate({
        where: { period: month, status: { not: 'VOID' } },
        _sum: { subtotalPaisa: true, discountPaisa: true },
        _count: true,
      }),
      tx.payment.findMany({
        where: { amountPaisa: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { student: { select: { user: { select: { displayName: true } } } } },
      }),
    ]);
    const ruleMap = new Map(rules.map((r) => [r.academicYearId, ruleOf(r)]));
    const get = (kind: string, direction: string) =>
      n(monthLedger.find((l) => l.kind === kind && l.direction === direction)?._sum.amountPaisa);
    let outstanding = 0;
    const overdueStudents = new Set<string>();
    for (const inv of open) {
      const t = invoiceTotals(inv, ruleMap.get(inv.academicYearId) ?? null, clock.today);
      outstanding += t.balancePaisa;
      if (t.overdue && t.balancePaisa > 0) overdueStudents.add(inv.studentId);
    }
    return {
      today: clock.today,
      month,
      collectedTodayPaisa: n(todayIn.find((t) => t.direction === 'IN')?._sum.amountPaisa),
      reversedTodayPaisa: n(todayIn.find((t) => t.direction === 'OUT')?._sum.amountPaisa),
      monthCollectedPaisa: get('FEE', 'IN') + get('ADVANCE', 'IN') - get('REVERSAL', 'OUT'),
      monthInvoicedPaisa: n(invoiced._sum.subtotalPaisa) - n(invoiced._sum.discountPaisa),
      monthBills: invoiced._count,
      monthExpensesPaisa: get('EXPENSE', 'OUT') - get('REVERSAL', 'IN') + get('SALARY', 'OUT'),
      outstandingPaisa: outstanding,
      defaulters: overdueStudents.size,
      claimsPending: claims,
      recentPayments: recent.map((p) => ({
        id: p.id,
        receiptNumber: p.receiptNumber,
        student: p.student.user.displayName,
        amountPaisa: n(p.amountPaisa),
        method: p.method,
        at: p.createdAt,
      })),
    };
  });
}
