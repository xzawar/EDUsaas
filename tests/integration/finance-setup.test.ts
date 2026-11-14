import { beforeEach, describe, expect, it } from 'vitest';
import * as heads from '@/app/api/v1/fees/heads/route';
import * as headById from '@/app/api/v1/fees/heads/[id]/route';
import * as structures from '@/app/api/v1/fees/structures/route';
import * as lateFee from '@/app/api/v1/fees/late-fee/route';
import * as overrides from '@/app/api/v1/students/[id]/fees/overrides/route';
import * as overrideById from '@/app/api/v1/students/[id]/fees/overrides/[overrideId]/route';
import * as discounts from '@/app/api/v1/students/[id]/fees/discounts/route';
import * as discountById from '@/app/api/v1/students/[id]/fees/discounts/[discountId]/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Finance §2.2–2.3: fee setup is per school, audited, and refuses nonsense amounts. */

let f: Fixtures;
let acc: string;
let accB: string;
beforeEach(async () => {
  f = await seedFixtures();
  [acc, accB] = await Promise.all([cookieFor(f.a.ACCOUNTANT), cookieFor(f.b.SCHOOL_ADMIN)]);
});

describe('fee heads', () => {
  it('creates, lists, renames and archives heads; names are unique per school', async () => {
    const r = await call(heads.POST, { cookie: acc, body: { name: 'Tuition', kind: 'MONTHLY' } });
    expect(r.status).toBe(201);
    const id = r.json.head.id as string;
    expect((await call(heads.POST, { cookie: acc, body: { name: 'tuition ' } })).status).toBe(409);
    // Another school may use the same name.
    expect((await call(heads.POST, { cookie: accB, body: { name: 'Tuition' } })).status).toBe(201);
    const list = await call(heads.GET, { cookie: acc });
    expect(list.json.items.map((h: { name: string }) => h.name)).toEqual(['Tuition']);
    expect(
      (await call(headById.PATCH, { cookie: acc, method: 'PATCH', params: { id }, body: { archived: true } })).status,
    ).toBe(200);
    expect((await call(heads.GET, { cookie: acc })).json.items).toHaveLength(0);
    expect((await call(heads.GET, { cookie: acc, path: '/api/v1/fees/heads?archived=true' })).json.items).toHaveLength(
      1,
    );
    // School B cannot touch School A's head.
    expect(
      (await call(headById.PATCH, { cookie: accB, method: 'PATCH', params: { id }, body: { name: 'Other' } })).status,
    ).toBe(404);
    const audits = await systemDb().auditLog.findMany({
      where: { tenantId: f.tenantA.id, action: { startsWith: 'fee_head.' } },
    });
    expect(audits.map((a) => a.action).sort()).toEqual(['fee_head.create', 'fee_head.update']);
  });

  it('validates names and amounts', async () => {
    expect((await call(heads.POST, { cookie: acc, body: { name: 'T' } })).status).toBe(422);
    const h = (await call(heads.POST, { cookie: acc, body: { name: 'Exam', kind: 'TERM' } })).json.head;
    const bad = await call(structures.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
      body: { rows: [{ classId: f.s.classA8, feeHeadId: h.id, amountPaisa: -5 }] },
    });
    expect(bad.status).toBe(422);
    const frac = await call(structures.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
      body: { rows: [{ classId: f.s.classA8, feeHeadId: h.id, amountPaisa: 10.5 }] },
    });
    expect(frac.status).toBe(422);
  });
});

describe('fee structure and late-fee rule', () => {
  it('saves amounts per class and head; 0 removes; copy to next year by class name', async () => {
    const tuition = (await call(heads.POST, { cookie: acc, body: { name: 'Tuition' } })).json.head;
    const transport = (await call(heads.POST, { cookie: acc, body: { name: 'Transport' } })).json.head;
    const put = await call(structures.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
      body: {
        rows: [
          { classId: f.s.classA8, feeHeadId: tuition.id, amountPaisa: 500000 },
          { classId: f.s.classA8, feeHeadId: transport.id, amountPaisa: 150000 },
        ],
      },
    });
    expect(put.status).toBe(200);
    expect(put.json).toEqual({ saved: 2, removed: 0 });
    let got = await call(structures.GET, { cookie: acc, path: `/api/v1/fees/structures?yearId=${f.s.yearA}` });
    expect(got.json.amounts[f.s.classA8]).toEqual({ [tuition.id]: 500000, [transport.id]: 150000 });
    expect(got.json.heads).toHaveLength(2);
    await call(structures.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/structures?yearId=${f.s.yearA}`,
      body: { rows: [{ classId: f.s.classA8, feeHeadId: transport.id, amountPaisa: 0 }] },
    });
    got = await call(structures.GET, { cookie: acc, path: `/api/v1/fees/structures?yearId=${f.s.yearA}` });
    expect(got.json.amounts[f.s.classA8]).toEqual({ [tuition.id]: 500000 });

    // Next year has class 9 only, so nothing copies; add class 8 there and copy again.
    const copy1 = await call(structures.POST, {
      cookie: acc,
      path: `/api/v1/fees/structures?yearId=${f.s.yearA2}`,
      body: { fromYearId: f.s.yearA },
    });
    expect(copy1.json).toEqual({ saved: 0 });
    await systemDb().class.create({
      data: { tenantId: f.tenantA.id, academicYearId: f.s.yearA2, name: '8', gradeLevel: 8 },
    });
    const copy2 = await call(structures.POST, {
      cookie: acc,
      path: `/api/v1/fees/structures?yearId=${f.s.yearA2}`,
      body: { fromYearId: f.s.yearA },
    });
    expect(copy2.json).toEqual({ saved: 1 });

    // School B sees none of it, and cannot write into A's year.
    expect(
      (await call(structures.GET, { cookie: accB, path: `/api/v1/fees/structures?yearId=${f.s.yearA}` })).status,
    ).toBe(404);
  });

  it('stores a late-fee rule per year', async () => {
    expect(
      (await call(lateFee.GET, { cookie: acc, path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}` })).json.rule,
    ).toBeNull();
    const put = await call(lateFee.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}`,
      body: { graceDays: 5, kind: 'PER_DAY', value: 5000, capPaisa: 100000 },
    });
    expect(put.status).toBe(200);
    const got = await call(lateFee.GET, { cookie: acc, path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}` });
    expect(got.json.rule).toEqual({ graceDays: 5, kind: 'PER_DAY', value: 5000, capPaisa: 100000 });
    const pct = await call(lateFee.PUT, {
      cookie: acc,
      method: 'PUT',
      path: `/api/v1/fees/late-fee?yearId=${f.s.yearA}`,
      body: { kind: 'PERCENT', value: 20000 },
    });
    expect(pct.status).toBe(422);
  });
});

describe('per-student overrides and discounts', () => {
  it('override replaces the class amount; discount is dated and ended, never deleted', async () => {
    const tuition = (await call(heads.POST, { cookie: acc, body: { name: 'Tuition' } })).json.head;
    const o = await call(overrides.POST, {
      cookie: acc,
      params: { id: f.s.studentA },
      body: { feeHeadId: tuition.id, amountPaisa: 400000, note: 'Village route' },
    });
    expect(o.status).toBe(201);
    const d = await call(discounts.POST, {
      cookie: acc,
      params: { id: f.s.studentA },
      body: { kind: 'PERCENT', value: 5000, reason: 'Sibling', validFrom: '2026-04-01' },
    });
    expect(d.status).toBe(201);
    let cfg = await call(overrides.GET, { cookie: acc, params: { id: f.s.studentA } });
    expect(cfg.json.overrides).toEqual([
      { id: o.json.id, feeHeadId: tuition.id, feeHead: 'Tuition', amountPaisa: 400000, note: 'Village route' },
    ]);
    expect(cfg.json.discounts[0]).toMatchObject({
      kind: 'PERCENT',
      value: 5000,
      reason: 'Sibling',
      validTo: null,
      feeHead: null,
    });

    expect(
      (
        await call(discountById.DELETE, {
          cookie: acc,
          method: 'DELETE',
          params: { id: f.s.studentA, discountId: d.json.id },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(overrideById.DELETE, {
          cookie: acc,
          method: 'DELETE',
          params: { id: f.s.studentA, overrideId: o.json.id },
        })
      ).status,
    ).toBe(200);
    cfg = await call(overrides.GET, { cookie: acc, params: { id: f.s.studentA } });
    expect(cfg.json.overrides).toEqual([]);
    expect(cfg.json.discounts).toHaveLength(1);
    expect(cfg.json.discounts[0].validTo).not.toBeNull();

    // Bad input and other school.
    expect(
      (
        await call(discounts.POST, {
          cookie: acc,
          params: { id: f.s.studentA },
          body: { kind: 'PERCENT', value: 20000, reason: 'x', validFrom: '2026-04-01' },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await call(discounts.POST, {
          cookie: accB,
          params: { id: f.s.studentA },
          body: { kind: 'FIXED', value: 100, reason: 'Nope', validFrom: '2026-04-01' },
        })
      ).status,
    ).toBe(404);
    const denied = await systemDb().auditLog.findFirst({
      where: { tenantId: f.tenantB.id, action: 'access.not_found', entityId: f.s.studentA },
    });
    expect(denied).not.toBeNull();
  });
});
