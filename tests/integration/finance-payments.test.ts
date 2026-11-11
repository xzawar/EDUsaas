import { beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as lateFee from '@/app/api/v1/fees/late-fee/route';
import * as generate from '@/app/api/v1/invoices/generate/route';
import * as invoices from '@/app/api/v1/invoices/route';
import * as invoiceById from '@/app/api/v1/invoices/[id]/route';
import * as studentFees from '@/app/api/v1/students/[id]/fees/route';
import * as payments from '@/app/api/v1/payments/route';
import * as receipt from '@/app/api/v1/payments/[id]/receipt/route';
import * as reverse from '@/app/api/v1/payments/[id]/reverse/route';
import { withTenant } from '@/server/db/client';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.3: payments, gap-free receipts, advances, reversals, the ledger. */

let f: Fixtures;
let acc: string;
let student: string;
let invoiceId: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const key = (i: number) => `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`;

const pay = (body: Record<string, unknown>, cookie = acc) =>
  call(payments.POST, {
    cookie,
    body: { studentId: f.s.studentA, invoiceId, method: 'CASH', receivedOn: today(), ...body },
  });

beforeEach(async () => {
  f = await seedFixtures();
  [acc, student] = await Promise.all([cookieFor(f.a.ACCOUNTANT), cookieFor(f.a.STUDENT)]);
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

describe('recording payments', () => {
  it('partial then full payment; receipts numbered; duplicate clientKey is a no-op', async () => {
    const p1 = await pay({ amountPaisa: 100000, clientKey: key(1) });
    expect(p1.status).toBe(201);
    expect(p1.json.payment.receiptNumber).toBe('R-000001');
    expect(p1.json.duplicate).toBe(false);
    let inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv).toMatchObject({ status: 'PARTIAL', paidPaisa: 100000, balancePaisa: 150000 });

    const dupe = await pay({ amountPaisa: 100000, clientKey: key(1) });
    expect(dupe.status).toBe(200);
    expect(dupe.json.duplicate).toBe(true);
    expect(dupe.json.payment.receiptNumber).toBe('R-000001');

    const p2 = await pay({ amountPaisa: 150000, method: 'JAZZCASH', reference: 'TX-99', clientKey: key(2) });
    expect(p2.json.payment.receiptNumber).toBe('R-000002');
    inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv).toMatchObject({ status: 'PAID', paidPaisa: 250000, balancePaisa: 0 });
    expect(inv.payments).toHaveLength(2);
    expect((await pay({ amountPaisa: 1, clientKey: key(3) })).status).toBe(409);

    const ledger = await systemDb().ledgerEntry.findMany({
      where: { tenantId: f.tenantA.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger.map((l) => [l.kind, l.direction, Number(l.amountPaisa)])).toEqual([
      ['FEE', 'IN', 100000],
      ['FEE', 'IN', 150000],
    ]);
    const notified = await systemDb().notification.count({ where: { userId: f.a.STUDENT.id, kind: 'fee.payment' } });
    expect(notified).toBe(2);
  });

  it('refuses more than the balance unless the extra is kept as advance, which pays the next bill (Review Focus 2)', async () => {
    const over = await pay({ amountPaisa: 300000, clientKey: key(1) });
    expect(over.status).toBe(422);
    expect(over.json.error.details.balancePaisa).toBe(250000);
    const ok = await pay({ amountPaisa: 300000, clientKey: key(2), allowAdvance: true });
    expect(ok.status).toBe(201);
    expect(ok.json.payment.allocatedPaisa).toBe(250000);
    let fees = await call(studentFees.GET, { cookie: acc, params: { id: f.s.studentA } });
    expect(fees.json.outstandingPaisa).toBe(0);
    expect(fees.json.advancePaisa).toBe(50000);
    // Next month's bill is partly paid from the advance.
    await call(generate.POST, { cookie: acc, body: { period: '2026-12' } });
    fees = await call(studentFees.GET, { cookie: acc, params: { id: f.s.studentA } });
    expect(fees.json.advancePaisa).toBe(0);
    const dec = fees.json.invoices.find((i: { period: string }) => i.period === '2026-12');
    expect(dec).toMatchObject({ status: 'PARTIAL', paidPaisa: 50000, balancePaisa: 200000 });
    // Money was counted once: the ledger has one IN entry of 300000.
    const sum = await systemDb().ledgerEntry.aggregate({
      where: { tenantId: f.tenantA.id, direction: 'IN' },
      _sum: { amountPaisa: true },
    });
    expect(Number(sum._sum.amountPaisa)).toBe(300000);
  });

  it('ten payments at once get ten distinct consecutive receipts and the right total (Review Focus 1)', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => pay({ amountPaisa: 10000, clientKey: key(10 + i) })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const numbers = results.map((r) => r.json.payment.receiptNumber).sort();
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => `R-${String(i + 1).padStart(6, '0')}`));
    const inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv.paidPaisa).toBe(100000);
    expect(inv.status).toBe('PARTIAL');
  });

  it('validates input', async () => {
    expect((await pay({ amountPaisa: 0, clientKey: key(1) })).status).toBe(422);
    expect((await pay({ amountPaisa: 100.5, clientKey: key(1) })).status).toBe(422);
    expect((await pay({ amountPaisa: 100, clientKey: 'nope' })).status).toBe(422);
    expect((await pay({ amountPaisa: 100, clientKey: key(1), receivedOn: '2099-01-01' })).status).toBe(422);
    expect(
      (await pay({ amountPaisa: 100, clientKey: key(1), invoiceId: undefined, studentId: f.s.studentB })).status,
    ).toBe(404);
  });
});

describe('reversal', () => {
  it('reverses a payment: mirror row, bill reopened, late fee live again, ledger counter-entry (Review Focus 4)', async () => {
    await systemDb().tenantSettings.update({ where: { tenantId: f.tenantA.id }, data: { feeDueDays: -20 } });
    await call(lateFee.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}`,
      body: { graceDays: 0, kind: 'FIXED', value: 5000 },
    });
    // Regenerate with the overdue due date.
    await systemDb().invoice.deleteMany({ where: { tenantId: f.tenantA.id } });
    await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    invoiceId = (await call(invoices.GET, { cookie: acc })).json.items[0].id;
    let inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv.lateFeePaisa).toBe(5000);

    const p = await pay({ amountPaisa: 255000, clientKey: key(1) });
    inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv.status).toBe('PAID');
    const frozen = await systemDb().invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(Number(frozen.lateFeePaisa)).toBe(5000);

    const bad = await call(reverse.POST, { cookie: acc, params: { id: p.json.payment.id }, body: { reason: 'x' } });
    expect(bad.status).toBe(422);
    const r = await call(reverse.POST, {
      cookie: acc,
      params: { id: p.json.payment.id },
      body: { reason: 'Wrong student' },
    });
    expect(r.status).toBe(200);
    expect(r.json.reversal.receiptNumber).toBe('R-000002');
    inv = (await call(invoiceById.GET, { cookie: acc, params: { id: invoiceId } })).json.invoice;
    expect(inv).toMatchObject({ status: 'DUE', paidPaisa: 0, balancePaisa: 255000, lateFeePaisa: 5000 });
    const thawed = await systemDb().invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(thawed.lateFeePaisa).toBeNull();

    const again = await call(reverse.POST, {
      cookie: acc,
      params: { id: p.json.payment.id },
      body: { reason: 'Again' },
    });
    expect(again.status).toBe(409);
    const rr = await call(reverse.POST, { cookie: acc, params: { id: r.json.reversal.id }, body: { reason: 'Nope' } });
    expect(rr.status).toBe(409);

    const ledger = await systemDb().ledgerEntry.findMany({
      where: { tenantId: f.tenantA.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger.map((l) => [l.kind, l.direction, Number(l.amountPaisa)])).toEqual([
      ['FEE', 'IN', 255000],
      ['REVERSAL', 'OUT', 255000],
    ]);
    const fees = await call(studentFees.GET, { cookie: acc, params: { id: f.s.studentA } });
    expect(
      fees.json.payments.map((x: { receiptNumber: string; reversed: boolean; isReversal: boolean }) => [
        x.receiptNumber,
        x.reversed,
        x.isReversal,
      ]),
    ).toEqual([
      ['R-000002', false, true],
      ['R-000001', true, false],
    ]);
  });

  it('the app role can never delete a payment', async () => {
    const p = await pay({ amountPaisa: 1000, clientKey: key(1) });
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) => tx.payment.delete({ where: { id: p.json.payment.id } })),
    ).rejects.toThrow(/denied/);
  });
});

describe('receipts', () => {
  it('is a PDF for the office and for the student it belongs to, and nobody else', async () => {
    const p = await pay({ amountPaisa: 1000, clientKey: key(1) });
    const id = p.json.payment.id as string;
    const mine = await call(receipt.GET, { cookie: acc, params: { id } });
    expect(mine.status).toBe(200);
    expect(mine.headers.get('content-type')).toBe('application/pdf');
    expect(String(mine.json).startsWith('%PDF-')).toBe(true);
    expect((await call(receipt.GET, { cookie: student, params: { id } })).status).toBe(200);
    expect((await call(receipt.GET, { cookie: await cookieFor(f.b.STUDENT), params: { id } })).status).toBe(404);
    expect((await call(receipt.GET, { cookie: await cookieFor(f.a.TEACHER), params: { id } })).status).toBe(403);
  });
});
