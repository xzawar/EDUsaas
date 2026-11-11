import 'server-only';
import { addDays, dateInTz } from '@/server/school/common';
import { withTenant } from '@/server/db/client';
import { systemDb } from '@/server/db/system';
import { generateInvoicesAsJob } from '@/server/school/finance/invoices';
import { applyAdvances } from '@/server/school/finance/payments';

/**
 * Finance jobs (spec §2.6), run from the daily cron. Each is idempotent per school and day: invoices are unique per
 * student and month, reminders are marked per invoice and stage, and advances only ever reduce open bills.
 */

async function schools() {
  return systemDb().tenant.findMany({
    where: { status: { not: 'SUSPENDED' } },
    select: { id: true, settings: { select: { timezone: true, invoiceDay: true, feeDueDays: true } } },
  });
}

/** On each school's invoice day (or later in the month if a run was missed), generate this month's bills. */
export async function generateMonthlyInvoices(now = new Date()) {
  const db = systemDb();
  let created = 0;
  for (const t of await schools()) {
    const today = dateInTz(now, t.settings?.timezone ?? 'Asia/Karachi');
    if (Number(today.slice(8, 10)) < (t.settings?.invoiceDay ?? 1)) continue;
    const period = today.slice(0, 7);
    const marker = `invoices:${period}`;
    if (await db.job.findFirst({ where: { tenantId: t.id, type: marker } })) continue;
    const hasFees = await db.feeStructure.count({ where: { tenantId: t.id, academicYear: { status: 'CURRENT' } } });
    if (!hasFees) continue;
    const r = await withTenant({ tenantId: t.id }, (tx) => generateInvoicesAsJob(tx, t.id, period), {
      timeoutMs: 120_000,
    });
    created += r.created;
    await db.job.create({ data: { tenantId: t.id, type: marker, status: 'SUCCEEDED', payload: r, finishedAt: now } });
  }
  return created;
}

/** Due-soon (3 days before) and overdue (the day after due) reminders, once per invoice per stage. */
export async function sendFeeReminders(now = new Date()) {
  const db = systemDb();
  let sent = 0;
  for (const t of await schools()) {
    const today = dateInTz(now, t.settings?.timezone ?? 'Asia/Karachi');
    const stages: { stage: string; where: { dueOn: Date }; title: (period: string) => string; body: string }[] = [
      {
        stage: 'due_soon',
        where: { dueOn: new Date(`${addDays(today, 3)}T00:00:00Z`) },
        title: (p) => `Fee for ${p} is due in 3 days`,
        body: 'Pay at the school office, or send your payment proof from the Fees page.',
      },
      {
        stage: 'overdue',
        where: { dueOn: new Date(`${addDays(today, -1)}T00:00:00Z`) },
        title: (p) => `Fee for ${p} is overdue`,
        body: 'Please pay as soon as you can. A late fee may apply from today.',
      },
    ];
    for (const s of stages) {
      const due = await db.invoice.findMany({
        where: { tenantId: t.id, status: { in: ['DUE', 'PARTIAL'] }, ...s.where, student: { status: 'ACTIVE' } },
        select: { id: true, period: true, student: { select: { userId: true } } },
      });
      for (const inv of due) {
        const marker = `fee_reminder:${s.stage}:${inv.id}`;
        if (await db.job.findFirst({ where: { tenantId: t.id, type: marker } })) continue;
        await db.notification.create({
          data: {
            tenantId: t.id,
            userId: inv.student.userId,
            kind: `fee.${s.stage}`,
            title: s.title(inv.period),
            body: s.body,
            link: '/student/fees',
          },
        });
        await db.job.create({
          data: { tenantId: t.id, type: marker, status: 'SUCCEEDED', payload: { invoiceId: inv.id }, finishedAt: now },
        });
        sent++;
      }
    }
  }
  return sent;
}

/** Applies any unallocated advance to open bills (safety net: normally done when bills are generated). */
export async function applyPendingAdvances(now = new Date()) {
  const db = systemDb();
  let applied = 0;
  for (const t of await schools()) {
    const today = dateInTz(now, t.settings?.timezone ?? 'Asia/Karachi');
    const candidates = await db.$queryRaw<{ student_id: string }[]>`
      SELECT DISTINCT p.student_id
      FROM payments p
      LEFT JOIN payment_allocations a ON a.payment_id = p.id
      WHERE p.tenant_id = ${t.id}::uuid AND p.amount_paisa > 0 AND p.reversed_by_payment_id IS NULL AND p.reverses_payment_id IS NULL
      GROUP BY p.id, p.student_id
      HAVING p.amount_paisa > COALESCE(SUM(a.amount_paisa), 0)`;
    if (!candidates.length) continue;
    const open = await db.invoice.findMany({
      where: {
        tenantId: t.id,
        status: { in: ['DUE', 'PARTIAL'] },
        studentId: { in: candidates.map((c) => c.student_id) },
      },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    for (const o of open)
      applied += await withTenant({ tenantId: t.id }, (tx) => applyAdvances(tx, t.id, o.studentId, today));
  }
  return applied;
}
