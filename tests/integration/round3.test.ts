import { beforeAll, describe, expect, it } from 'vitest';
import * as login from '@/app/api/v1/auth/[portal]/login/route';
import * as me from '@/app/api/v1/auth/me/route';
import * as accounts from '@/app/api/v1/fees/accounts/route';
import * as accountById from '@/app/api/v1/fees/accounts/[id]/route';
import * as myFees from '@/app/api/v1/me/fees/route';
import * as userLogin from '@/app/api/v1/users/[id]/login/route';
import * as mergeClerk from '@/app/api/v1/users/merge-clerk/route';
import * as assessments from '@/app/api/v1/assessments/route';
import * as assessmentById from '@/app/api/v1/assessments/[id]/route';
import * as marks from '@/app/api/v1/assessments/[id]/marks/route';
import * as publish from '@/app/api/v1/assessments/[id]/publish/route';
import * as resultsMe from '@/app/api/v1/results/me/route';
import * as attSections from '@/app/api/v1/attendance/sections/route';
import * as attSheet from '@/app/api/v1/attendance/sheet/route';
import * as tenantById from '@/app/api/v1/platform/tenants/[id]/route';
import * as stats from '@/app/api/v1/platform/stats/route';
import * as plan from '@/app/api/v1/plan/route';
import * as grading from '@/app/api/v1/grading-scheme/route';
import { systemDb } from '@/server/db/system';
import { PASSWORD, cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Round 3 of app feedback: payment accounts, admin sign-in edits, Clerk seats, teacher publishing, first-lecture
 * registers, deleting a school, app stats and the school's own plan view. */

let f: Fixtures;
let admin: string;
beforeAll(async () => {
  f = await seedFixtures();
  admin = await cookieFor(f.a.SCHOOL_ADMIN);
});

describe('where parents pay', () => {
  it('the admin lists accounts; students see only the shown ones, also with their fees', async () => {
    const bank = await call(accounts.POST, {
      cookie: admin,
      body: {
        method: 'BANK',
        label: 'Meezan Bank',
        accountTitle: 'School A',
        accountNumber: '0101-0105',
        iban: 'pk36mezn0001010105550100',
      },
    });
    expect(bank.status).toBe(201);
    const wallet = await call(accounts.POST, {
      cookie: admin,
      body: { method: 'JAZZCASH', label: 'JazzCash', accountTitle: 'School A', accountNumber: '0300-1234567' },
    });
    // Cheques are not a transfer channel.
    const cheque = await call(accounts.POST, {
      cookie: admin,
      body: { method: 'CHEQUE', label: 'Cheque', accountTitle: 'x', accountNumber: '1234' },
    });
    expect(cheque.status).toBe(422);
    await call(accountById.PATCH, {
      cookie: admin,
      method: 'PATCH',
      params: { id: wallet.json.id },
      body: {
        method: 'JAZZCASH',
        label: 'JazzCash',
        accountTitle: 'School A',
        accountNumber: '0300-1234567',
        active: false,
      },
    });
    const student = await cookieFor(f.a.STUDENT);
    const seen = await call(accounts.GET, { cookie: student });
    expect(seen.json.items.map((a: { label: string }) => a.label)).toEqual(['Meezan Bank']);
    expect(seen.json.items[0].iban).toBe('PK36MEZN0001010105550100');
    const fees = await call(myFees.GET, { cookie: student });
    expect(fees.json.accounts).toHaveLength(1);
    expect((await call(accounts.GET, { cookie: admin })).json.items).toHaveLength(2);
    // Another school sees none of it.
    expect((await call(accounts.GET, { cookie: await cookieFor(f.b.SCHOOL_ADMIN) })).json.items).toHaveLength(0);
  });
});

describe('admin sets someone’s sign-in', () => {
  it('changes a student’s password and username directly; the old password stops working', async () => {
    const r = await call(userLogin.PATCH, {
      cookie: admin,
      method: 'PATCH',
      params: { id: f.a.STUDENT.id },
      body: { password: 'fresh-pass-42', username: 'sca-8a-renamed-1' },
    });
    expect(r.status).toBe(200);
    expect(r.json.username).toBe('sca-8a-renamed-1');
    const old = await call(login.POST, {
      params: { portal: 'student' },
      body: { identifier: 'sca-8a-renamed-1', password: PASSWORD },
    });
    expect(old.status).toBe(401);
    const fresh = await call(login.POST, {
      params: { portal: 'student' },
      body: { identifier: 'SCA-8A-Renamed-1', password: 'fresh-pass-42' },
    });
    expect(fresh.status).toBe(200);
    // The new password is theirs to use straight away (no forced change).
    expect(
      (await call(me.GET, { cookie: await cookieFor({ ...f.a.STUDENT, login: 'sca-8a-renamed-1' }) })).json.user
        .mustChangePassword,
    ).toBe(false);
  });

  it('keeps usernames inside the school’s prefix and never touches the admin', async () => {
    const other = await call(userLogin.PATCH, {
      cookie: admin,
      method: 'PATCH',
      params: { id: f.a.TEACHER.id },
      body: { username: 'scb-t-stolen-1' },
    });
    expect(other.status).toBe(422);
    const self = await call(userLogin.PATCH, {
      cookie: admin,
      method: 'PATCH',
      params: { id: f.a.SCHOOL_ADMIN.id },
      body: { password: 'another-pass-1' },
    });
    expect(self.status).toBe(422);
    const weak = await call(userLogin.PATCH, {
      cookie: admin,
      method: 'PATCH',
      params: { id: f.a.TEACHER.id },
      body: { password: 'short' },
    });
    expect(weak.status).toBe(422);
    const principal = await call(userLogin.PATCH, {
      cookie: await cookieFor(f.a.PRINCIPAL),
      method: 'PATCH',
      params: { id: f.a.TEACHER.id },
      body: { password: 'another-pass-1' },
    });
    expect(principal.status).toBe(403);
  });
});

describe('teacher publishing and test details', () => {
  it('a teacher publishes their own test when the school allows it; students see the chapter', async () => {
    await call(grading.PUT, {
      method: 'PUT',
      cookie: admin,
      body: {
        bands: [
          { grade: 'A', min: 80 },
          { grade: 'F', min: 0 },
        ],
      },
    });
    const teacher = await cookieFor(f.a.TEACHER);
    const created = await call(assessments.POST, {
      cookie: teacher,
      body: {
        sectionId: f.s.sectionA8A,
        subjectId: f.s.subjMath,
        name: 'Quiz 1',
        maxMarks: 20,
        heldOn: '2026-09-03',
        chapter: 'Chapter 4: Fractions',
        details: 'Bring a calculator',
      },
    });
    expect(created.status).toBe(201);
    const id = created.json.assessment.id;
    await call(marks.PUT, {
      cookie: teacher,
      method: 'PUT',
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 17, absent: false }], submit: true },
    });
    // Default: the School Admin publishes.
    expect((await call(publish.POST, { cookie: teacher, method: 'POST', params: { id } })).status).toBe(403);
    await systemDb().tenantSettings.update({ where: { tenantId: f.tenantA.id }, data: { marksPublisher: 'TEACHER' } });
    const sheet = await call(assessmentById.GET, { cookie: teacher, params: { id } });
    expect(sheet.json.assessment).toMatchObject({
      canPublish: true,
      chapter: 'Chapter 4: Fractions',
      details: 'Bring a calculator',
    });
    expect((await call(publish.POST, { cookie: teacher, method: 'POST', params: { id } })).status).toBe(200);
    const results = await call(resultsMe.GET, { cookie: await cookieFor(f.a.STUDENT) });
    expect(results.json.items[0]).toMatchObject({ name: 'Quiz 1', chapter: 'Chapter 4: Fractions', score: 17 });
    // The admin still can, the principal still can't.
    expect(
      (await call(publish.POST, { cookie: await cookieFor(f.a.PRINCIPAL), method: 'POST', params: { id } })).status,
    ).toBe(403);
    await systemDb().tenantSettings.update({
      where: { tenantId: f.tenantA.id },
      data: { marksPublisher: 'SCHOOL_ADMIN' },
    });
  });
});

describe('registers follow the first lecture', () => {
  it('with a timetable, a teacher takes the register only for their first lecture’s class', async () => {
    const db = systemDb();
    const teacher = await cookieFor(f.a.TEACHER);
    await db.teacherAssignment.create({
      data: { tenantId: f.tenantA.id, teacherId: f.s.teacherA, sectionId: f.s.sectionA8B, subjectId: f.s.subjMath },
    });
    const before = await call(attSections.GET, { cookie: teacher });
    expect(before.json.sections.map((s: { label: string }) => s.label).sort()).toEqual(['8-A', '8-B']);
    const dow = ((new Date(`${before.json.today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const [p1, p2] = await Promise.all(
      [1, 2].map((periodNo) =>
        db.timetableSlot.create({
          data: {
            tenantId: f.tenantA.id,
            dayOfWeek: dow,
            periodNo,
            startsAt: `0${7 + periodNo}:00`,
            endsAt: `0${7 + periodNo}:40`,
          },
        }),
      ),
    );
    await db.timetableEntry.createMany({
      data: [
        {
          tenantId: f.tenantA.id,
          sectionId: f.s.sectionA8B,
          slotId: p1!.id,
          subjectId: f.s.subjMath,
          teacherId: f.s.teacherA,
        },
        {
          tenantId: f.tenantA.id,
          sectionId: f.s.sectionA8A,
          slotId: p2!.id,
          subjectId: f.s.subjMath,
          teacherId: f.s.teacherA,
        },
      ],
    });
    const after = await call(attSections.GET, { cookie: teacher });
    expect(after.json.sections.map((s: { label: string }) => s.label)).toEqual(['8-B']);
    const other = await call(attSheet.GET, {
      cookie: teacher,
      path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8A}`,
    });
    expect(other.status).toBe(404);
    const mine = await call(attSheet.GET, {
      cookie: teacher,
      path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8B}`,
    });
    expect(mine.status).toBe(200);
    // The School Admin still oversees every register.
    expect(
      (await call(attSheet.GET, { cookie: admin, path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8A}` }))
        .status,
    ).toBe(200);
    await db.timetableEntry.deleteMany({ where: { tenantId: f.tenantA.id } });
    await db.timetableSlot.deleteMany({ where: { tenantId: f.tenantA.id } });
  });
});

describe('Clerk seat', () => {
  it('merges the Accountant and Admissions Officer into one Clerk with both jobs', async () => {
    const r = await call(mergeClerk.POST, {
      cookie: admin,
      body: { keepId: f.a.ACCOUNTANT.id, retireId: f.a.ADMISSIONS_OFFICER.id },
    });
    expect(r.status).toBe(200);
    const [keep, retire] = await Promise.all([
      systemDb().user.findUniqueOrThrow({ where: { id: f.a.ACCOUNTANT.id } }),
      systemDb().user.findUniqueOrThrow({ where: { id: f.a.ADMISSIONS_OFFICER.id } }),
    ]);
    expect(keep.role).toBe('CLERK');
    expect(retire.status).toBe('DISABLED');
    const clerk = await call(me.GET, { cookie: await cookieFor({ ...f.a.ACCOUNTANT, role: 'CLERK' }) });
    expect(clerk.json.permissions).toEqual(expect.arrayContaining(['fees.collect', 'students.write']));
    // The retired seat can no longer sign in.
    const out = await call(login.POST, {
      params: { portal: 'staff' },
      body: { identifier: f.a.ADMISSIONS_OFFICER.login, password: PASSWORD },
    });
    expect(out.status).toBe(401);
    // A teacher cannot be folded in.
    const bad = await call(mergeClerk.POST, {
      cookie: admin,
      body: { keepId: f.a.ACCOUNTANT.id, retireId: f.a.TEACHER.id },
    });
    expect(bad.status).toBe(422);
  });
});

describe('platform owner', () => {
  it('sees app stats; the school admin sees its own plan', async () => {
    const owner = await cookieFor(f.owner);
    const s = await call(stats.GET, { cookie: owner });
    expect(s.status).toBe(200);
    expect(s.json.usage).toHaveProperty('activeSessions');
    expect(s.json.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(s.json.server.cpus).toBeGreaterThan(0);
    const p = await call(plan.GET, { cookie: admin });
    expect(p.status).toBe(200);
    expect(p.json).toHaveProperty('plans');
  });

  it('deletes a suspended school and all of its data after typing the prefix', async () => {
    const owner = await cookieFor(f.owner);
    const id = f.tenantB.id;
    const active = await call(tenantById.DELETE, {
      cookie: owner,
      method: 'DELETE',
      params: { id },
      body: { confirmPrefix: f.tenantB.prefix },
    });
    expect(active.status).toBe(409);
    await call(tenantById.PATCH, { cookie: owner, method: 'PATCH', params: { id }, body: { status: 'SUSPENDED' } });
    const wrong = await call(tenantById.DELETE, {
      cookie: owner,
      method: 'DELETE',
      params: { id },
      body: { confirmPrefix: 'nope' },
    });
    expect(wrong.status).toBe(422);
    const ok = await call(tenantById.DELETE, {
      cookie: owner,
      method: 'DELETE',
      params: { id },
      body: { confirmPrefix: f.tenantB.prefix },
    });
    expect(ok.status).toBe(200);
    const db = systemDb();
    expect(await db.tenant.findUnique({ where: { id } })).toBeNull();
    expect(await db.user.count({ where: { tenantId: id } })).toBe(0);
    expect(await db.student.count({ where: { tenantId: id } })).toBe(0);
    // School A is untouched, and the deletion is on the platform record.
    expect(await db.student.count({ where: { tenantId: f.tenantA.id } })).toBeGreaterThan(0);
    expect(await db.auditLog.count({ where: { action: 'tenant.delete', entityId: id } })).toBe(1);
  });
});
