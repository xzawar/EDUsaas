import { beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as generate from '@/app/api/v1/invoices/generate/route';
import * as invoices from '@/app/api/v1/invoices/route';
import * as invoiceById from '@/app/api/v1/invoices/[id]/route';
import * as invoiceVoid from '@/app/api/v1/invoices/[id]/void/route';
import * as payments from '@/app/api/v1/payments/route';
import * as reverse from '@/app/api/v1/payments/[id]/reverse/route';
import * as meClaims from '@/app/api/v1/me/fees/claims/route';
import * as decide from '@/app/api/v1/fees/claims/[id]/decide/route';
import * as structure from '@/app/api/v1/payroll/structures/[userId]/route';
import * as runs from '@/app/api/v1/payroll/runs/route';
import * as finalise from '@/app/api/v1/payroll/runs/[id]/finalise/route';
import * as pay from '@/app/api/v1/payroll/runs/[id]/pay/route';
import * as expenses from '@/app/api/v1/expenses/route';
import * as categories from '@/app/api/v1/expenses/categories/route';
import * as expenseReverse from '@/app/api/v1/expenses/[id]/reverse/route';
import { systemDb } from '@/server/db/system';
import { setStorageForTests } from '@/server/files/storage';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/**
 * Money writes that arrive at the same moment (two counters, a double-click, two office users) must be applied one
 * after the other: one bill is never paid twice over, one proof never becomes two receipts, one payroll run is never
 * posted twice. Plus the two money rules found in review: the payroll voucher cannot be reversed, and a cancelled bill
 * can be issued again.
 */

let f: Fixtures;
let acc: string;
let invoiceId: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const key = (i: number) => `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`;
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1200, 1)]).toString(
    'base64',
  );
const statuses = (rs: { status: number }[]) => rs.map((r) => r.status).sort();
const ledger = (kind: string) =>
  systemDb().ledgerEntry.findMany({ where: { tenantId: f.tenantA.id, kind: kind as never } });

beforeEach(async () => {
  f = await seedFixtures();
  setStorageForTests(undefined);
  acc = await cookieFor(f.a.ACCOUNTANT);
  const tuition = (await call(heads.POST, { cookie: acc, body: { name: 'Tuition' } })).json.head.id;
  await call(structures.PUT, {
    cookie: acc,
    method: 'PUT',
    path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
    body: { rows: [{ classId: f.s.classA8, feeHeadId: tuition, amountPaisa: 250000 }] },
  });
  await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
  invoiceId = (await call(invoices.GET, { cookie: acc })).json.items[0].id;
});

describe('payments on one bill at the same moment', () => {
  it('two counters paying the full balance: one receipt, the other is told the bill is paid', async () => {
    const other = await cookieFor(f.a.SCHOOL_ADMIN);
    const body = (i: number) => ({
      studentId: f.s.studentA,
      invoiceId,
      amountPaisa: 250000,
      method: 'CASH',
      receivedOn: today(),
      clientKey: key(i),
    });
    const rs = await Promise.all([
      call(payments.POST, { cookie: acc, body: body(1) }),
      call(payments.POST, { cookie: other, body: body(2) }),
    ]);
    expect(statuses(rs)).toEqual([201, 409]);
    const inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv).toMatchObject({ status: 'PAID', paidPaisa: 250000, balancePaisa: 0 });
    expect(await systemDb().payment.count({ where: { tenantId: f.tenantA.id } })).toBe(1);
  });

  it('a payment and a cancel at the same moment: never a cancelled bill with money on it', async () => {
    const rs = await Promise.all([
      call(payments.POST, {
        cookie: acc,
        body: {
          studentId: f.s.studentA,
          invoiceId,
          amountPaisa: 100000,
          method: 'CASH',
          receivedOn: today(),
          clientKey: key(3),
        },
      }),
      call(invoiceVoid.POST, { cookie: acc, params: { id: invoiceId }, body: { reason: 'Wrong amount' } }),
    ]);
    const inv = await systemDb().invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const allocated = await systemDb().paymentAllocation.count({ where: { invoiceId } });
    // Whichever came first wins; the other is refused.
    expect(statuses(rs)).toContain(409);
    expect(inv.status === 'VOID' ? allocated : 1).toBe(inv.status === 'VOID' ? 0 : 1);
  });

  it('reversing one payment twice at once posts one reversal', async () => {
    const p = await call(payments.POST, {
      cookie: acc,
      body: {
        studentId: f.s.studentA,
        invoiceId,
        amountPaisa: 100000,
        method: 'CASH',
        receivedOn: today(),
        clientKey: key(4),
      },
    });
    const id = p.json.payment.id as string;
    const rs = await Promise.all([
      call(reverse.POST, { cookie: acc, params: { id }, body: { reason: 'Bounced' } }),
      call(reverse.POST, { cookie: acc, params: { id }, body: { reason: 'Bounced' } }),
    ]);
    expect(statuses(rs)).toEqual([200, 409]);
    expect((await ledger('REVERSAL')).length).toBe(1);
  });
});

describe('payment proofs', () => {
  it('two office users confirming one proof at once: one receipt, one "already decided"', async () => {
    const sent = await call(meClaims.POST, {
      cookie: await cookieFor(f.a.STUDENT),
      body: {
        invoiceId,
        amountPaisa: 250000,
        method: 'JAZZCASH',
        reference: 'TX-77',
        paidOn: today(),
        proof: png(),
        clientKey: key(5),
      },
    });
    const id = sent.json.id as string;
    const other = await cookieFor(f.a.SCHOOL_ADMIN);
    // Each sends its own clientKey, as two browsers would; the claim itself must key the payment.
    const rs = await Promise.all([
      call(decide.POST, { cookie: acc, params: { id }, body: { decision: 'CONFIRM', clientKey: key(6) } }),
      call(decide.POST, { cookie: other, params: { id }, body: { decision: 'CONFIRM', clientKey: key(7) } }),
    ]);
    expect(statuses(rs)).toEqual([200, 409]);
    expect(await systemDb().payment.count({ where: { tenantId: f.tenantA.id } })).toBe(1);
    expect((await ledger('FEE')).length).toBe(1);
    const c = await systemDb().paymentClaim.findUniqueOrThrow({ where: { id } });
    expect(c.status).toBe('CONFIRMED');
    expect(c.paymentId).not.toBeNull();
  });

  it('a reject racing a confirm leaves one consistent outcome', async () => {
    const sent = await call(meClaims.POST, {
      cookie: await cookieFor(f.a.STUDENT),
      body: {
        invoiceId,
        amountPaisa: 100000,
        method: 'BANK',
        reference: 'TX-78',
        paidOn: today(),
        proof: png(),
        clientKey: key(8),
      },
    });
    const id = sent.json.id as string;
    const rs = await Promise.all([
      call(decide.POST, { cookie: acc, params: { id }, body: { decision: 'CONFIRM' } }),
      call(decide.POST, { cookie: acc, params: { id }, body: { decision: 'REJECT', note: 'Cannot find it' } }),
    ]);
    expect(statuses(rs)).toEqual([200, 409]);
    const c = await systemDb().paymentClaim.findUniqueOrThrow({ where: { id } });
    const paymentsMade = await systemDb().payment.count({ where: { tenantId: f.tenantA.id } });
    expect(c.status === 'CONFIRMED' ? paymentsMade : 0).toBe(c.status === 'CONFIRMED' ? 1 : paymentsMade);
  });
});

describe('payroll', () => {
  const salaryRun = async () => {
    await call(structure.PUT, {
      cookie: acc,
      method: 'PUT',
      params: { userId: f.a.TEACHER.id },
      body: { basicPaisa: 3000000, allowances: [], deductions: [], effectiveFrom: '2026-01-01' },
    });
    const id = (await call(runs.POST, { cookie: acc, body: { period: '2026-10' } })).json.id as string;
    expect((await call(finalise.POST, { cookie: acc, params: { id } })).status).toBe(200);
    return id;
  };

  it('a double-click on Pay posts each salary once', async () => {
    const id = await salaryRun();
    const body = { paidOn: today(), method: 'BANK' };
    const rs = await Promise.all([
      call(pay.POST, { cookie: acc, params: { id }, body }),
      call(pay.POST, { cookie: acc, params: { id }, body }),
    ]);
    expect(statuses(rs)).toEqual([200, 409]);
    expect((await ledger('SALARY')).length).toBe(1);
    expect(await systemDb().expense.count({ where: { tenantId: f.tenantA.id } })).toBe(1);
  });

  it('the payroll "Staff salaries" voucher cannot be reversed; an ordinary expense still can', async () => {
    const id = await salaryRun();
    await call(pay.POST, { cookie: acc, params: { id }, body: { paidOn: today(), method: 'BANK' } });
    const voucher = (await call(expenses.GET, { cookie: acc })).json.items[0];
    const r = await call(expenseReverse.POST, { cookie: acc, params: { id: voucher.id }, body: { reason: 'Mistake' } });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/payroll/);
    expect((await ledger('REVERSAL')).length).toBe(0);

    const cat = (await call(categories.POST, { cookie: acc, body: { name: 'Stationery' } })).json.category;
    const e = await call(expenses.POST, {
      cookie: acc,
      body: {
        categoryId: cat.id,
        amountPaisa: 5000,
        spentOn: today(),
        paidTo: 'Book Depot',
        method: 'CASH',
        clientKey: key(9),
      },
    });
    const eid = e.json.expense.id as string;
    const twice = await Promise.all([
      call(expenseReverse.POST, { cookie: acc, params: { id: eid }, body: { reason: 'Returned' } }),
      call(expenseReverse.POST, { cookie: acc, params: { id: eid }, body: { reason: 'Returned' } }),
    ]);
    expect(statuses(twice)).toEqual([200, 409]);
    expect((await ledger('REVERSAL')).length).toBe(1);
  });
});

describe('cancelled bills', () => {
  it('a cancelled bill can be issued again for the same month, and only one live bill exists', async () => {
    expect(
      (await call(invoiceVoid.POST, { cookie: acc, params: { id: invoiceId }, body: { reason: 'Wrong fee setup' } }))
        .status,
    ).toBe(200);
    const again = await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    expect(again.json.created).toBe(1);
    const all = await systemDb().invoice.findMany({ where: { studentId: f.s.studentA, period: '2026-11' } });
    expect(all.map((i) => i.status).sort()).toEqual(['DUE', 'VOID']);
    // Running it once more creates nothing: the new bill is live.
    expect((await call(generate.POST, { cookie: acc, body: { period: '2026-11' } })).json.created).toBe(0);
    // The database itself refuses a second live bill for the month.
    const live = all.find((i) => i.status === 'DUE')!;
    await expect(
      systemDb().invoice.create({
        data: {
          tenantId: live.tenantId,
          studentId: live.studentId,
          academicYearId: live.academicYearId,
          period: live.period,
          number: 'I-TEST-1',
          issuedOn: live.issuedOn,
          dueOn: live.dueOn,
          subtotalPaisa: 1n,
          discountPaisa: 0n,
        },
      }),
    ).rejects.toThrow();
  });
});
