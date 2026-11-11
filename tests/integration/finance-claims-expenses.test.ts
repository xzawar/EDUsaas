import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as generate from '@/app/api/v1/invoices/generate/route';
import * as invoices from '@/app/api/v1/invoices/route';
import * as meFees from '@/app/api/v1/me/fees/route';
import * as meClaims from '@/app/api/v1/me/fees/claims/route';
import * as claims from '@/app/api/v1/fees/claims/route';
import * as decide from '@/app/api/v1/fees/claims/[id]/decide/route';
import * as proof from '@/app/api/v1/fees/claims/[id]/proof/route';
import * as categories from '@/app/api/v1/expenses/categories/route';
import * as categoryById from '@/app/api/v1/expenses/categories/[id]/route';
import * as expenses from '@/app/api/v1/expenses/route';
import * as expenseReverse from '@/app/api/v1/expenses/[id]/reverse/route';
import * as expenseReceipt from '@/app/api/v1/expenses/[id]/receipt/route';
import { systemDb } from '@/server/db/system';
import { setStorageForTests } from '@/server/files/storage';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.3: parent payment proofs, and expenses with vouchers. */

let f: Fixtures;
let acc: string;
let student: string;
let invoiceId: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const key = (i: number) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`;
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1200, 1)]).toString(
    'base64',
  );

beforeEach(async () => {
  f = await seedFixtures();
  setStorageForTests(undefined);
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
afterEach(() => setStorageForTests(undefined));

const claim = (body: Record<string, unknown>) =>
  call(meClaims.POST, {
    cookie: student,
    body: {
      invoiceId,
      amountPaisa: 250000,
      method: 'JAZZCASH',
      reference: 'TX-1',
      paidOn: today(),
      proof: png(),
      ...body,
    },
  });

describe('payment claims', () => {
  it('student sends proof → office notified → confirm records the payment and the student sees the receipt', async () => {
    const c = await claim({ clientKey: key(1) });
    expect(c.status).toBe(201);
    expect(c.json.status).toBe('PENDING');
    expect((await claim({ clientKey: key(1) })).json.duplicate).toBe(true);
    // Counting the pending proof, nothing is left to claim.
    const over = await claim({ clientKey: key(2), amountPaisa: 1 });
    expect(over.status).toBe(422);
    expect(over.json.error.details.balancePaisa).toBe(0);
    expect(await systemDb().notification.count({ where: { userId: f.a.ACCOUNTANT.id, kind: 'claim.submitted' } })).toBe(
      1,
    );
    expect(
      await systemDb().notification.count({ where: { userId: f.a.SCHOOL_ADMIN.id, kind: 'claim.submitted' } }),
    ).toBe(1);

    const queue = await call(claims.GET, { cookie: acc });
    expect(queue.json.pending).toBe(1);
    expect(queue.json.items[0]).toMatchObject({
      amountPaisa: 250000,
      method: 'JAZZCASH',
      hasProof: true,
      student: { section: '8-A' },
    });
    const img = await call(proof.GET, { cookie: acc, params: { id: c.json.id } });
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect((await call(proof.GET, { cookie: student, params: { id: c.json.id } })).status).toBe(200);
    expect((await call(proof.GET, { cookie: await cookieFor(f.b.STUDENT), params: { id: c.json.id } })).status).toBe(
      404,
    );

    const ok = await call(decide.POST, { cookie: acc, params: { id: c.json.id }, body: { decision: 'CONFIRM' } });
    expect(ok.status).toBe(200);
    expect(ok.json.payment.receiptNumber).toBe('R-000001');
    expect(
      (await call(decide.POST, { cookie: acc, params: { id: c.json.id }, body: { decision: 'CONFIRM' } })).status,
    ).toBe(409);
    const fees = await call(meFees.GET, { cookie: student });
    expect(fees.json.invoices[0].status).toBe('PAID');
    expect(fees.json.claims[0]).toMatchObject({ status: 'CONFIRMED', paymentId: ok.json.payment.id });
    expect(await systemDb().notification.count({ where: { userId: f.a.STUDENT.id, kind: 'claim.confirmed' } })).toBe(1);
    const mine = await call(meClaims.GET, { cookie: student });
    expect(mine.json.items).toHaveLength(1);
  });

  it('rejecting needs a note and tells the student; the bill stays open', async () => {
    const c = await claim({ clientKey: key(1), amountPaisa: 100000 });
    expect(
      (await call(decide.POST, { cookie: acc, params: { id: c.json.id }, body: { decision: 'REJECT' } })).status,
    ).toBe(422);
    const r = await call(decide.POST, {
      cookie: acc,
      params: { id: c.json.id },
      body: { decision: 'REJECT', note: 'Reference number not found in our bank statement' },
    });
    expect(r.json.status).toBe('REJECTED');
    const fees = await call(meFees.GET, { cookie: student });
    expect(fees.json.invoices[0].status).toBe('DUE');
    expect(fees.json.claims[0].decisionNote).toContain('bank statement');
    expect(await systemDb().notification.count({ where: { userId: f.a.STUDENT.id, kind: 'claim.rejected' } })).toBe(1);
    // After a rejection the amount can be claimed again.
    expect((await claim({ clientKey: key(2), amountPaisa: 250000 })).status).toBe(201);
  });

  it('refuses bad proofs and says when storage is missing', async () => {
    expect(
      (await claim({ clientKey: key(1), proof: Buffer.from('not an image at all, really').toString('base64') })).status,
    ).toBe(422);
    expect((await claim({ clientKey: key(1), method: 'CASH' })).status).toBe(422);
    expect((await claim({ clientKey: key(1), paidOn: '2099-01-01' })).status).toBe(422);
    setStorageForTests(null);
    const r = await claim({ clientKey: key(2) });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/storage/i);
  });
});

describe('expenses', () => {
  it('records with a voucher and ledger OUT, reverses with a mirror, archives categories', async () => {
    const cat = (await call(categories.POST, { cookie: acc, body: { name: 'Utilities' } })).json.category;
    expect((await call(categories.POST, { cookie: acc, body: { name: 'utilities' } })).status).toBe(409);
    const e = await call(expenses.POST, {
      cookie: acc,
      body: {
        categoryId: cat.id,
        amountPaisa: 1250000,
        spentOn: today(),
        paidTo: 'LESCO',
        method: 'BANK',
        reference: 'Bill 4421',
        clientKey: key(1),
        receipt: png(),
      },
    });
    expect(e.status).toBe(201);
    expect(e.json.expense).toMatchObject({
      voucherNumber: 'V-000001',
      category: 'Utilities',
      amountPaisa: 1250000,
      hasReceipt: true,
    });
    expect(
      (
        await call(expenses.POST, {
          cookie: acc,
          body: {
            categoryId: cat.id,
            amountPaisa: 1,
            spentOn: today(),
            paidTo: 'X Y',
            method: 'CASH',
            clientKey: key(1),
          },
        })
      ).json.duplicate,
    ).toBe(true);
    expect((await call(expenseReceipt.GET, { cookie: acc, params: { id: e.json.expense.id } })).status).toBe(200);

    const list = await call(expenses.GET, { cookie: acc });
    expect(list.json.totalPaisa).toBe(1250000);
    expect(list.json.items).toHaveLength(1);

    const rev = await call(expenseReverse.POST, {
      cookie: acc,
      params: { id: e.json.expense.id },
      body: { reason: 'Entered twice' },
    });
    expect(rev.json.reversal.voucherNumber).toBe('V-000002');
    expect(
      (await call(expenseReverse.POST, { cookie: acc, params: { id: e.json.expense.id }, body: { reason: 'Again' } }))
        .status,
    ).toBe(409);
    const after = await call(expenses.GET, { cookie: acc });
    expect(after.json.totalPaisa).toBe(0);
    expect(
      after.json.items.map((x: { voucherNumber: string; isReversal: boolean }) => [x.voucherNumber, x.isReversal]),
    ).toEqual([
      ['V-000002', true],
      ['V-000001', false],
    ]);
    const ledger = await systemDb().ledgerEntry.findMany({
      where: { tenantId: f.tenantA.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(ledger.map((l) => [l.kind, l.direction, Number(l.amountPaisa)])).toEqual([
      ['EXPENSE', 'OUT', 1250000],
      ['REVERSAL', 'IN', 1250000],
    ]);

    expect(
      (
        await call(categoryById.PATCH, {
          cookie: acc,
          method: 'PATCH',
          params: { id: cat.id },
          body: { archived: true },
        })
      ).status,
    ).toBe(200);
    expect((await call(categories.GET, { cookie: acc })).json.items).toHaveLength(0);
    expect(
      (
        await call(expenses.POST, {
          cookie: acc,
          body: {
            categoryId: cat.id,
            amountPaisa: 1,
            spentOn: today(),
            paidTo: 'X Y',
            method: 'CASH',
            clientKey: key(5),
          },
        })
      ).status,
    ).toBe(409);
    // History still shows the archived category's name.
    expect((await call(expenses.GET, { cookie: acc })).json.items[1].category).toBe('Utilities');
  });

  it('is invisible to the other school', async () => {
    const cat = (await call(categories.POST, { cookie: acc, body: { name: 'Repairs' } })).json.category;
    const b = await cookieFor(f.b.SCHOOL_ADMIN);
    expect((await call(categories.GET, { cookie: b })).json.items).toHaveLength(0);
    expect(
      (
        await call(expenses.POST, {
          cookie: b,
          body: {
            categoryId: cat.id,
            amountPaisa: 100,
            spentOn: today(),
            paidTo: 'Someone',
            method: 'CASH',
            clientKey: key(1),
          },
        })
      ).status,
    ).toBe(404);
  });
});
