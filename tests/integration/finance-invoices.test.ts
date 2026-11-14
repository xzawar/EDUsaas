import { beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as lateFee from '@/app/api/v1/fees/late-fee/route';
import * as discounts from '@/app/api/v1/students/[id]/fees/discounts/route';
import * as generate from '@/app/api/v1/invoices/generate/route';
import * as invoices from '@/app/api/v1/invoices/route';
import * as invoiceById from '@/app/api/v1/invoices/[id]/route';
import * as invoiceVoid from '@/app/api/v1/invoices/[id]/void/route';
import * as waive from '@/app/api/v1/invoices/[id]/waive-late-fee/route';
import * as studentFees from '@/app/api/v1/students/[id]/fees/route';
import * as meFees from '@/app/api/v1/me/fees/route';
import * as payments from '@/app/api/v1/payments/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.3: invoice generation, live late fees, status, scoping. */

let f: Fixtures;
let acc: string;
let student: string;
let accB: string;
let tuitionId: string;
let examId: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const thisMonth = () => today().slice(0, 7);

async function setup() {
  tuitionId = (await call(heads.POST, { cookie: acc, body: { name: 'Tuition' } })).json.head.id;
  examId = (await call(heads.POST, { cookie: acc, body: { name: 'Exam', kind: 'TERM' } })).json.head.id;
  await call(structures.PUT, {
    cookie: acc,
    method: 'PUT',
    path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
    body: {
      rows: [
        { classId: f.s.classA8, feeHeadId: tuitionId, amountPaisa: 500000 },
        { classId: f.s.classA8, feeHeadId: examId, amountPaisa: 200000 },
      ],
    },
  });
}

beforeEach(async () => {
  f = await seedFixtures();
  [acc, student, accB] = await Promise.all([
    cookieFor(f.a.ACCOUNTANT),
    cookieFor(f.a.STUDENT),
    cookieFor(f.b.SCHOOL_ADMIN),
  ]);
  await setup();
});

describe('generation', () => {
  it('creates one bill per placed student with discounted lines; running again creates nothing', async () => {
    await call(discounts.POST, {
      cookie: acc,
      params: { id: f.s.studentA },
      body: { kind: 'PERCENT', value: 5000, reason: 'Sibling', validFrom: '2026-01-01' },
    });
    // November is not a term start (Apr/Sep/Jan), so only Tuition is billed.
    const r = await call(generate.POST, { cookie: acc, body: { period: '2026-11', classId: f.s.classA8 } });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ created: 1, skipped: 0 });
    const again = await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    expect(again.json).toEqual({ created: 0, skipped: 1 });

    const list = await call(invoices.GET, { cookie: acc, path: '/api/v1/invoices?period=2026-11' });
    expect(list.json.total).toBe(1);
    const inv = list.json.items[0];
    expect(inv).toMatchObject({
      number: 'I-000001',
      status: 'DUE',
      subtotalPaisa: 500000,
      discountPaisa: 250000,
      lateFeePaisa: 0,
      totalPaisa: 250000,
      paidPaisa: 0,
      balancePaisa: 250000,
    });
    const detail = await call(invoiceById.GET, { cookie: acc, params: { id: inv.id } });
    expect(detail.json.invoice.lines).toEqual([
      expect.objectContaining({ feeHead: 'Tuition', amountPaisa: 500000, discountPaisa: 250000 }),
    ]);

    // A term month bills the exam fee too, labelled with the term.
    const sep = await call(generate.POST, { cookie: acc, body: { period: '2026-09' } });
    expect(sep.json.created).toBe(1);
    const sepList = await call(invoices.GET, { cookie: acc, path: '/api/v1/invoices?period=2026-09' });
    const sepDetail = await call(invoiceById.GET, { cookie: acc, params: { id: sepList.json.items[0].id } });
    expect(sepDetail.json.invoice.lines.map((l: { description: string }) => l.description)).toEqual([
      'Tuition',
      'Exam (2026-T2)',
    ]);
    expect(sepDetail.json.invoice.number).toBe('I-000002');
    const audit = await systemDb().auditLog.findFirst({
      where: { tenantId: f.tenantA.id, action: 'invoice.generate' },
    });
    expect(audit?.actorId).toBe(f.a.ACCOUNTANT.id);
  });

  it('skips unplaced and withdrawn students and classes without amounts', async () => {
    await systemDb().student.update({
      where: { id: f.s.studentA },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    const r = await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    expect(r.json).toEqual({ created: 0, skipped: 0 });
  });

  it('a student who changes class is billed at the new class from the next month (Review Focus 3)', async () => {
    await call(generate.POST, { cookie: acc, body: { period: '2026-10' } });
    // Move studentA to a class with a cheaper structure.
    const class7 = await systemDb().class.create({
      data: { tenantId: f.tenantA.id, academicYearId: f.s.yearA, name: '7', gradeLevel: 7 },
    });
    const sec = await systemDb().section.create({ data: { tenantId: f.tenantA.id, classId: class7.id, name: 'A' } });
    await call(structures.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
      body: { rows: [{ classId: class7.id, feeHeadId: tuitionId, amountPaisa: 300000 }] },
    });
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { sectionId: sec.id, rollNumber: 1 } });
    await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    const fees = await call(studentFees.GET, { cookie: acc, params: { id: f.s.studentA } });
    const byPeriod = Object.fromEntries(
      fees.json.invoices.map((i: { period: string; subtotalPaisa: number }) => [i.period, i.subtotalPaisa]),
    );
    expect(byPeriod).toEqual({ '2026-10': 500000, '2026-11': 300000 });
  });
});

describe('late fee, void and waive', () => {
  it('late fee is live from the rule after due + grace, and is waivable', async () => {
    await systemDb().tenantSettings.update({ where: { tenantId: f.tenantA.id }, data: { feeDueDays: -20 } });
    await call(lateFee.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}`,
      body: { graceDays: 5, kind: 'PER_DAY', value: 1000, capPaisa: 10000 },
    });
    await call(generate.POST, { cookie: acc, body: { period: thisMonth() } });
    let list = await call(invoices.GET, { cookie: acc, path: '/api/v1/invoices?status=OVERDUE' });
    expect(list.json.total).toBe(1);
    const inv = list.json.items[0];
    expect(inv.lateFeePaisa).toBe(10000); // 15 late days × 10 → capped at 100
    expect(inv.totalPaisa).toBe(510000);
    expect(inv.overdue).toBe(true);

    await call(waive.POST, { cookie: acc, params: { id: inv.id }, body: { reason: 'Family hardship' } });
    list = await call(invoices.GET, { cookie: acc, path: '/api/v1/invoices?status=OPEN' });
    expect(list.json.items[0].lateFeePaisa).toBe(0);
    expect(list.json.items[0].totalPaisa).toBe(500000);
  });

  it('void works only before any payment', async () => {
    await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    const inv = (await call(invoices.GET, { cookie: acc })).json.items[0];
    expect((await call(invoiceVoid.POST, { cookie: acc, params: { id: inv.id }, body: { reason: 'Du' } })).status).toBe(
      422,
    );
    const pay = await call(payments.POST, {
      cookie: acc,
      body: {
        studentId: f.s.studentA,
        invoiceId: inv.id,
        amountPaisa: 100000,
        method: 'CASH',
        receivedOn: today(),
        clientKey: '11111111-1111-4111-8111-111111111111',
      },
    });
    expect(pay.status).toBe(201);
    expect(
      (await call(invoiceVoid.POST, { cookie: acc, params: { id: inv.id }, body: { reason: 'Duplicate' } })).status,
    ).toBe(409);
    // A fresh unpaid bill can be voided, and a voided bill cannot be paid.
    await call(generate.POST, { cookie: acc, body: { period: '2026-12' } });
    const dec = (await call(invoices.GET, { cookie: acc, path: '/api/v1/invoices?period=2026-12' })).json.items[0];
    expect(
      (await call(invoiceVoid.POST, { cookie: acc, params: { id: dec.id }, body: { reason: 'Duplicate' } })).status,
    ).toBe(200);
    const paid = await call(payments.POST, {
      cookie: acc,
      body: {
        studentId: f.s.studentA,
        invoiceId: dec.id,
        amountPaisa: 100,
        method: 'CASH',
        receivedOn: today(),
        clientKey: '11111111-1111-4111-8111-111111111112',
      },
    });
    expect(paid.status).toBe(409);
  });
});

describe('scoping', () => {
  it('students see only their own bills; other schools see nothing', async () => {
    await call(generate.POST, { cookie: acc, body: { period: '2026-11' } });
    const mine = await call(meFees.GET, { cookie: student });
    expect(mine.status).toBe(200);
    expect(mine.json.invoices).toHaveLength(1);
    expect(mine.json.outstandingPaisa).toBe(500000);
    const inv = mine.json.invoices[0];
    expect((await call(invoiceById.GET, { cookie: student, params: { id: inv.id } })).status).toBe(200);
    const other = await cookieFor(f.b.STUDENT);
    expect((await call(invoiceById.GET, { cookie: other, params: { id: inv.id } })).status).toBe(404);
    expect((await call(meFees.GET, { cookie: other })).json.invoices).toHaveLength(0);
    expect((await call(invoices.GET, { cookie: accB })).json.total).toBe(0);
    expect((await call(studentFees.GET, { cookie: accB, params: { id: f.s.studentA } })).status).toBe(404);
  });
});
