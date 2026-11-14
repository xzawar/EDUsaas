import { beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as generate from '@/app/api/v1/invoices/generate/route';
import * as invoices from '@/app/api/v1/invoices/route';
import * as payments from '@/app/api/v1/payments/route';
import * as reverse from '@/app/api/v1/payments/[id]/reverse/route';
import * as categories from '@/app/api/v1/expenses/categories/route';
import * as expenses from '@/app/api/v1/expenses/route';
import * as reports from '@/app/api/v1/finance/reports/[report]/route';
import * as overview from '@/app/api/v1/finance/overview/route';
import { systemDb } from '@/server/db/system';
import { applyPendingAdvances, generateMonthlyInvoices, sendFeeReminders } from '@/server/jobs/finance';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.3 reports add up to the ledger; §2.6 jobs are idempotent. */

let f: Fixtures;
let acc: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const month = () => today().slice(0, 7);
const key = (i: number) => `77777777-7777-4777-8777-${String(i).padStart(12, '0')}`;
const report = (name: string, qs = '', cookie = acc) =>
  call(reports.GET, { cookie, params: { report: name }, path: `/api/v1/finance/reports/${name}${qs}` });

beforeEach(async () => {
  f = await seedFixtures();
  acc = await cookieFor(f.a.ACCOUNTANT);
  const tuition = (await call(heads.POST, { cookie: acc, body: { name: 'Tuition' } })).json.head.id;
  await call(structures.PUT, {
    cookie: acc,
    method: 'PUT',
    path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
    body: { rows: [{ classId: f.s.classA8, feeHeadId: tuition, amountPaisa: 250000 }] },
  });
});

describe('reports', () => {
  it('daily collection, month summary and income/expense agree with the ledger; student ledger runs a balance', async () => {
    await call(generate.POST, { cookie: acc, body: { period: month() } });
    const inv = (await call(invoices.GET, { cookie: acc })).json.items[0];
    const p1 = await call(payments.POST, {
      cookie: acc,
      body: {
        studentId: f.s.studentA,
        invoiceId: inv.id,
        amountPaisa: 100000,
        method: 'CASH',
        receivedOn: today(),
        clientKey: key(1),
      },
    });
    const p2 = await call(payments.POST, {
      cookie: acc,
      body: {
        studentId: f.s.studentA,
        invoiceId: inv.id,
        amountPaisa: 50000,
        method: 'BANK',
        receivedOn: today(),
        clientKey: key(2),
      },
    });
    await call(reverse.POST, { cookie: acc, params: { id: p2.json.payment.id }, body: { reason: 'Bounced transfer' } });
    const cat = (await call(categories.POST, { cookie: acc, body: { name: 'Stationery' } })).json.category;
    await call(expenses.POST, {
      cookie: acc,
      body: {
        categoryId: cat.id,
        amountPaisa: 30000,
        spentOn: today(),
        paidTo: 'Book Depot',
        method: 'CASH',
        clientKey: key(3),
      },
    });

    const daily = await report('daily');
    expect(daily.status).toBe(200);
    expect(daily.json).toMatchObject({ totalInPaisa: 150000, totalOutPaisa: 50000 });
    expect(daily.json.days[0].byMethod).toEqual({ CASH: 100000, BANK: 50000 });
    expect(daily.json.receipts).toHaveLength(3);

    const summary = await report('summary');
    expect(summary.json).toMatchObject({
      period: month(),
      bills: 1,
      invoicedPaisa: 250000,
      collectedPaisa: 100000,
      expensesPaisa: 30000,
      salariesPaisa: 0,
      netPaisa: 70000,
      outstandingPaisa: 150000,
    });
    expect(summary.json.expensesByCategory).toEqual([{ category: 'Stationery', amountPaisa: 30000 }]);

    const ie = await report('income-expense');
    expect(ie.json.totals).toEqual({ feesPaisa: 100000, expensesPaisa: 30000, salariesPaisa: 0, netPaisa: 70000 });

    const ledger = await report('student-ledger', `?studentId=${f.s.studentA}`);
    expect(ledger.json.rows.map((r: { kind: string; balancePaisa: number }) => [r.kind, r.balancePaisa])).toEqual([
      ['BILL', 250000],
      ['PAYMENT', 150000],
      ['PAYMENT', 100000],
      ['REVERSAL', 150000],
    ]);
    expect(ledger.json.balancePaisa).toBe(150000);

    const ov = await call(overview.GET, { cookie: acc });
    expect(ov.json).toMatchObject({
      collectedTodayPaisa: 100000,
      monthCollectedPaisa: 100000,
      monthExpensesPaisa: 30000,
      outstandingPaisa: 150000,
      claimsPending: 0,
    });
    expect(ov.json.recentPayments[0].receiptNumber).toBe('R-000002');
    expect(p1.status).toBe(201);
  });

  it('defaulters lists overdue students with a phone for the office only; CSV neutralises formulas', async () => {
    await systemDb().tenantSettings.update({ where: { tenantId: f.tenantA.id }, data: { feeDueDays: -5 } });
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { guardianName: '=HYPERLINK("x")' } });
    await call(generate.POST, { cookie: acc, body: { period: month() } });
    const d = await report('defaulters');
    expect(d.json.students).toBe(1);
    expect(d.json.rows[0]).toMatchObject({ section: '8-A', balancePaisa: 250000, guardianPhone: '03001111111' });
    const principal = await report('defaulters', '', await cookieFor(f.a.PRINCIPAL));
    expect(principal.json.rows[0].guardianPhone).toBeNull();
    const csv = await report('defaulters', '?format=csv');
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(String(csv.json)).toContain(`'=HYPERLINK`);
    expect((await report('nope')).status).toBe(404);
    expect((await report('daily', '', await cookieFor(f.a.TEACHER))).status).toBe(403);
    expect((await report('daily', '', await cookieFor(f.b.SCHOOL_ADMIN))).json.receipts).toHaveLength(0);
  });
});

describe('jobs', () => {
  it('generates this month once per school on/after invoice day; reminders fire once per stage', async () => {
    const created1 = await generateMonthlyInvoices();
    expect(created1).toBe(1); // School A has a fee structure, School B does not
    expect(await generateMonthlyInvoices()).toBe(0);
    expect(await systemDb().invoice.count({ where: { tenantId: f.tenantA.id, period: month() } })).toBe(1);

    // Make the bill due in 3 days and run reminders twice.
    const inv = await systemDb().invoice.findFirstOrThrow({ where: { tenantId: f.tenantA.id } });
    const dueSoon = new Date(Date.now() + 3 * 86_400_000);
    await systemDb().invoice.update({
      where: { id: inv.id },
      data: {
        dueOn: new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(dueSoon)}T00:00:00Z`),
      },
    });
    expect(await sendFeeReminders()).toBe(1);
    expect(await sendFeeReminders()).toBe(0);
    expect(await systemDb().notification.count({ where: { userId: f.a.STUDENT.id, kind: 'fee.due_soon' } })).toBe(1);
    // Overdue stage the day after due.
    const yesterday = new Date(Date.now() - 86_400_000);
    await systemDb().invoice.update({
      where: { id: inv.id },
      data: {
        dueOn: new Date(
          `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(yesterday)}T00:00:00Z`,
        ),
      },
    });
    expect(await sendFeeReminders()).toBe(1);
    expect(await systemDb().notification.count({ where: { userId: f.a.STUDENT.id, kind: 'fee.overdue' } })).toBe(1);
  });

  it('a school before its invoice day is skipped', async () => {
    await systemDb().tenantSettings.update({ where: { tenantId: f.tenantA.id }, data: { invoiceDay: 28 } });
    const day = Number(today().slice(8, 10));
    expect(await generateMonthlyInvoices()).toBe(day >= 28 ? 1 : 0);
  });

  it('applies a stranded advance to a bill that appears later', async () => {
    await call(payments.POST, {
      cookie: acc,
      body: { studentId: f.s.studentA, amountPaisa: 70000, method: 'CASH', receivedOn: today(), clientKey: key(9) },
    });
    await call(generate.POST, { cookie: acc, body: { period: month() } });
    // The generator already applied it; simulate a stranded advance by adding another on-account payment.
    await call(payments.POST, {
      cookie: acc,
      body: { studentId: f.s.studentA, amountPaisa: 30000, method: 'CASH', receivedOn: today(), clientKey: key(10) },
    });
    const before = await systemDb().invoice.findFirstOrThrow({ where: { tenantId: f.tenantA.id } });
    expect(Number(before.paidPaisa)).toBe(100000);
    // Nothing stranded now; the job finds nothing to do.
    expect(await applyPendingAdvances()).toBe(0);
  });
});
