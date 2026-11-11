import { beforeEach, describe, expect, it } from 'vitest';
import * as roster from '@/app/api/v1/payroll/structures/route';
import * as structure from '@/app/api/v1/payroll/structures/[userId]/route';
import * as runs from '@/app/api/v1/payroll/runs/route';
import * as runById from '@/app/api/v1/payroll/runs/[id]/route';
import * as finalise from '@/app/api/v1/payroll/runs/[id]/finalise/route';
import * as pay from '@/app/api/v1/payroll/runs/[id]/pay/route';
import * as payslip from '@/app/api/v1/payslips/[id]/route';
import * as mePayslips from '@/app/api/v1/me/payslips/route';
import * as expenses from '@/app/api/v1/expenses/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.3: salary structures, monthly runs, unpaid-leave deduction, paying, payslips. */

let f: Fixtures;
let acc: string;
let teacher: string;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

const setSalary = (userId: string, body: Record<string, unknown> = {}) =>
  call(structure.PUT, {
    cookie: acc,
    method: 'PUT',
    params: { userId },
    body: {
      basicPaisa: 3000000,
      allowances: [{ name: 'Transport', amountPaisa: 500000 }],
      deductions: [{ name: 'Fund', amountPaisa: 100000 }],
      effectiveFrom: '2026-01-01',
      ...body,
    },
  });

beforeEach(async () => {
  f = await seedFixtures();
  [acc, teacher] = await Promise.all([cookieFor(f.a.ACCOUNTANT), cookieFor(f.a.TEACHER)]);
});

describe('salary structures', () => {
  it('sets, reads and lists; students and other schools are not staff', async () => {
    expect((await setSalary(f.a.TEACHER.id)).status).toBe(200);
    const s = await call(structure.GET, { cookie: acc, params: { userId: f.a.TEACHER.id } });
    expect(s.json.structure).toMatchObject({ basicPaisa: 3000000, netPaisa: 3400000, perDayDeduction: 'BASIC_30' });
    expect((await setSalary(f.a.STUDENT.id)).status).toBe(404);
    expect((await setSalary(f.b.TEACHER.id)).status).toBe(404);
    const list = await call(roster.GET, { cookie: acc });
    const row = list.json.items.find((u: { id: string }) => u.id === f.a.TEACHER.id);
    expect(row.netPaisa).toBe(3400000);
    expect(list.json.items.find((u: { id: string }) => u.id === f.a.PRINCIPAL.id).netPaisa).toBeNull();
    expect((await setSalary(f.a.TEACHER.id, { basicPaisa: -1 })).status).toBe(422);
  });
});

describe('payroll run', () => {
  it('deducts approved unpaid leave on working days only; staff without a salary get no payslip (Review Focus 5)', async () => {
    await setSalary(f.a.TEACHER.id);
    await setSalary(f.a.PRINCIPAL.id, { basicPaisa: 6000000, allowances: [], deductions: [] });
    // 2 working days of unpaid leave (Mon 2 Nov – Tue 3 Nov 2026) and 1 day of paid leave.
    const unpaid = await systemDb().leaveType.create({
      data: { tenantId: f.tenantA.id, name: 'Unpaid leave', forStudents: false, paid: false },
    });
    const paidType = await systemDb().leaveType.create({
      data: { tenantId: f.tenantA.id, name: 'Casual', forStudents: false, paid: true },
    });
    await systemDb().leaveRequest.createMany({
      data: [
        {
          tenantId: f.tenantA.id,
          applicantId: f.a.TEACHER.id,
          typeId: unpaid.id,
          fromDate: new Date('2026-10-31'),
          toDate: new Date('2026-11-03'),
          status: 'APPROVED',
          reason: 'Family matter',
        },
        {
          tenantId: f.tenantA.id,
          applicantId: f.a.TEACHER.id,
          typeId: paidType.id,
          fromDate: new Date('2026-11-10'),
          toDate: new Date('2026-11-10'),
          status: 'APPROVED',
          reason: 'Personal work',
        },
        {
          tenantId: f.tenantA.id,
          applicantId: f.a.TEACHER.id,
          typeId: unpaid.id,
          fromDate: new Date('2026-11-20'),
          toDate: new Date('2026-11-20'),
          status: 'PENDING',
          reason: 'Not yet decided',
        },
      ],
    });
    const r = await call(runs.POST, { cookie: acc, body: { period: '2026-11' } });
    expect(r.status).toBe(201);
    // Oct 31 is outside the month; Nov 1 is a Sunday; Nov 2–3 count → 2 days × 3000000/30.
    expect(r.json).toMatchObject({ staff: 2, totalPaisa: 3200000 + 6000000 });
    const run = (await call(runById.GET, { cookie: acc, params: { id: r.json.id } })).json.run;
    const slip = run.payslips.find((p: { userId: string }) => p.userId === f.a.TEACHER.id);
    expect(slip).toMatchObject({
      unpaidLeaveDays: 2,
      leaveDeductionPaisa: 200000,
      netPaisa: 3200000,
      number: 'P-000001',
    });
    expect(run.payslips.find((p: { userId: string }) => p.userId === f.a.ADMISSIONS_OFFICER.id)).toBeUndefined();
    expect((await call(runs.POST, { cookie: acc, body: { period: '2026-11' } })).status).toBe(409);
  });

  it('draft → finalise → pay: ledger entries, salaries expense, payslips visible to staff', async () => {
    await setSalary(f.a.TEACHER.id);
    const r = await call(runs.POST, { cookie: acc, body: { period: '2026-10' } });
    const id = r.json.id as string;
    // Drafts are private; paying a draft is refused; a draft can be deleted and re-run.
    expect((await call(mePayslips.GET, { cookie: teacher })).json.items).toHaveLength(0);
    expect(
      (await call(pay.POST, { cookie: acc, params: { id }, body: { paidOn: today(), method: 'BANK' } })).status,
    ).toBe(409);
    expect((await call(runById.DELETE, { cookie: acc, method: 'DELETE', params: { id } })).status).toBe(200);
    const r2 = await call(runs.POST, { cookie: acc, body: { period: '2026-10' } });
    const id2 = r2.json.id as string;

    expect((await call(finalise.POST, { cookie: acc, params: { id: id2 } })).status).toBe(200);
    expect((await call(finalise.POST, { cookie: acc, params: { id: id2 } })).status).toBe(409);
    expect((await call(runById.DELETE, { cookie: acc, method: 'DELETE', params: { id: id2 } })).status).toBe(409);
    const mine = await call(mePayslips.GET, { cookie: teacher });
    expect(mine.json.items).toHaveLength(1);
    expect(mine.json.items[0]).toMatchObject({ period: '2026-10', netPaisa: 3400000, paidOn: null });
    expect(await systemDb().notification.count({ where: { userId: f.a.TEACHER.id, kind: 'payslip.ready' } })).toBe(1);

    const paid = await call(pay.POST, {
      cookie: acc,
      params: { id: id2 },
      body: { paidOn: today(), method: 'BANK', reference: 'Batch 7' },
    });
    expect(paid.json).toEqual({ paid: 1, totalPaisa: 3400000, status: 'PAID' });
    expect(
      (await call(pay.POST, { cookie: acc, params: { id: id2 }, body: { paidOn: today(), method: 'BANK' } })).status,
    ).toBe(409);
    const ledger = await systemDb().ledgerEntry.findMany({ where: { tenantId: f.tenantA.id } });
    expect(ledger.map((l) => [l.kind, l.direction, Number(l.amountPaisa), l.userId])).toEqual([
      ['SALARY', 'OUT', 3400000, f.a.TEACHER.id],
    ]);
    const ex = await call(expenses.GET, { cookie: acc });
    expect(ex.json.items[0]).toMatchObject({ category: 'Salaries', amountPaisa: 3400000 });

    // Payslip PDF: owner and payroll staff only.
    const slipId = mine.json.items[0].id as string;
    const pdf = await call(payslip.GET, { cookie: teacher, params: { id: slipId } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect((await call(payslip.GET, { cookie: acc, params: { id: slipId } })).status).toBe(200);
    expect((await call(payslip.GET, { cookie: await cookieFor(f.a.PRINCIPAL), params: { id: slipId } })).status).toBe(
      404,
    );
    expect(
      (await call(payslip.GET, { cookie: await cookieFor(f.b.SCHOOL_ADMIN), params: { id: slipId } })).status,
    ).toBe(404);
  });
});
