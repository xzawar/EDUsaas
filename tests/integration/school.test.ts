import { beforeEach, describe, expect, it } from 'vitest';
import * as login from '@/app/api/v1/auth/[portal]/login/route';
import * as students from '@/app/api/v1/students/route';
import * as studentById from '@/app/api/v1/students/[id]/route';
import * as transfer from '@/app/api/v1/students/[id]/transfer/route';
import * as withdraw from '@/app/api/v1/students/[id]/withdraw/route';
import * as restore from '@/app/api/v1/students/[id]/restore/route';
import * as studentReset from '@/app/api/v1/students/[id]/reset-password/route';
import * as userReset from '@/app/api/v1/users/[id]/reset-password/route';
import * as sectionById from '@/app/api/v1/sections/[id]/route';
import * as renumber from '@/app/api/v1/sections/[id]/renumber/route';
import * as assignments from '@/app/api/v1/teachers/[id]/assignments/route';
import * as teachers from '@/app/api/v1/teachers/route';
import * as promotions from '@/app/api/v1/promotions/route';
import * as copyStructure from '@/app/api/v1/academic-years/[id]/copy-structure/route';
import { systemDb } from '@/server/db/system';
import { withTenant } from '@/server/db/client';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

let f: Fixtures;
let admin: string;
beforeEach(async () => {
  f = await seedFixtures();
  admin = await cookieFor(f.a.SCHOOL_ADMIN);
});

async function admit(name: string, sectionId: string, cookie = admin) {
  const r = await call(students.POST, { cookie, body: { displayName: name, sectionId } });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json as { id: string; username: string; rollNumber: number; temporaryPassword: string; section: string };
}

const studentLogin = (identifier: string, password: string) =>
  call(login.POST, { params: { portal: 'student' }, body: { identifier, password } });

describe('admissions', () => {
  it('assigns the next roll number and a class-embedded username (spec §3.2, §3.3)', async () => {
    const one = await admit('Hamza Tariq', f.s.sectionA8A);
    const two = await admit('Hamza Tariq', f.s.sectionA8A);
    expect(one.rollNumber).toBe(2);
    expect(two.rollNumber).toBe(3);
    expect(one.username).toBe('sca-8a-hamza-2');
    expect(two.username).toBe('sca-8a-hamza-3');
    expect(one.section).toBe('8-A');
  });

  it('issues a temporary password that works once and forces a change', async () => {
    const s = await admit('Laiba Shah', f.s.sectionA8B);
    const r = await studentLogin(s.username.toUpperCase(), s.temporaryPassword);
    expect(r.status).toBe(200);
    expect(r.json.redirectTo).toBe('/change-password');
  });

  it('Admissions Officer can admit; Principal cannot unless enabled', async () => {
    await admit('Sara Ali', f.s.sectionA8B, await cookieFor(f.a.ADMISSIONS_OFFICER));
    const p = await call(students.POST, {
      cookie: await cookieFor(f.a.PRINCIPAL),
      body: { displayName: 'X Y', sectionId: f.s.sectionA8B },
    });
    expect(p.status).toBe(403);
  });

  it('rejects placing a student in another school’s section', async () => {
    const r = await call(students.POST, { cookie: admin, body: { displayName: 'Ghost', sectionId: f.s.sectionB9B } });
    expect(r.status).toBe(404);
  });
});

describe('guardian details (spec §5.5)', () => {
  it('only the School Admin can edit them, and the edit is audited', async () => {
    const ao = await call(studentById.PATCH, {
      method: 'PATCH',
      cookie: await cookieFor(f.a.ADMISSIONS_OFFICER),
      params: { id: f.s.studentA },
      body: { guardianPhone: '0301 2222222' },
    });
    expect(ao.status).toBe(403);
    const sa = await call(studentById.PATCH, {
      method: 'PATCH',
      cookie: admin,
      params: { id: f.s.studentA },
      body: { guardianPhone: '0301 2222222' },
    });
    expect(sa.status).toBe(200);
    const audit = await systemDb().auditLog.findFirstOrThrow({
      where: { action: 'student.update_guardian', entityId: f.s.studentA },
    });
    expect(audit.before).toEqual({ guardianPhone: '03001111111' });
    expect(audit.after).toEqual({ guardianPhone: '03012222222' });
  });
});

describe('teacher scope (spec §2.4, §4)', () => {
  it('teachers only see students in their own sections', async () => {
    const other = await admit('Outside Scope', f.s.sectionA8B);
    const teacher = await cookieFor(f.a.TEACHER);
    const list = await call(students.GET, { cookie: teacher });
    const ids = (list.json.items as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(f.s.studentA);
    expect(ids).not.toContain(other.id);
    const direct = await call(studentById.GET, { cookie: teacher, params: { id: other.id } });
    expect(direct.status).toBe(404);
    expect(await systemDb().auditLog.count({ where: { action: 'access.not_found', entityId: other.id } })).toBe(1);
  });

  it('teachers can’t search guardian phone numbers school-wide', async () => {
    const list = await call(students.GET, {
      cookie: await cookieFor(f.a.TEACHER),
      path: '/api/v1/students?q=03001111111',
    });
    expect(list.json.items).toHaveLength(0);
    const adminList = await call(students.GET, { cookie: admin, path: '/api/v1/students?q=0300 1111111' });
    expect((adminList.json.items as { id: string }[]).map((s) => s.id)).toContain(f.s.studentA);
  });
});

describe('transfer, withdraw, restore', () => {
  it('transfer gives the next roll in the new section and a new username; the old one stops working', async () => {
    const s = await admit('Moiz Khan', f.s.sectionA8A);
    const r = await call(transfer.POST, { cookie: admin, params: { id: s.id }, body: { sectionId: f.s.sectionA8B } });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ section: '8-B', rollNumber: 1, username: 'sca-8b-moiz-1' });
    expect((await studentLogin(s.username, s.temporaryPassword)).status).toBe(401);
    expect((await studentLogin('sca-8b-moiz-1', s.temporaryPassword)).status).toBe(200);
  });

  it('withdrawing blocks sign-in immediately; restoring within 30 days brings it back', async () => {
    const s = await admit('Rida Malik', f.s.sectionA8B);
    expect((await call(withdraw.POST, { method: 'POST', cookie: admin, params: { id: s.id } })).status).toBe(200);
    expect((await studentLogin(s.username, s.temporaryPassword)).status).toBe(401);
    expect((await call(restore.POST, { method: 'POST', cookie: admin, params: { id: s.id } })).status).toBe(200);
    expect((await studentLogin(s.username, s.temporaryPassword)).status).toBe(200);
  });

  it('refuses to restore after the 30-day window', async () => {
    const s = await admit('Old Leaver', f.s.sectionA8B);
    await call(withdraw.POST, { method: 'POST', cookie: admin, params: { id: s.id } });
    await systemDb().student.update({
      where: { id: s.id },
      data: { withdrawnAt: new Date(Date.now() - 31 * 86400000) },
    });
    const r = await call(restore.POST, { method: 'POST', cookie: admin, params: { id: s.id } });
    expect(r.status).toBe(422);
  });
});

describe('roll-number renumbering (spec §3.3)', () => {
  it('closes gaps, keeps withdrawn students clear of clashes, and changes usernames', async () => {
    const a = await admit('Ali One', f.s.sectionA8B); // roll 1
    const b = await admit('Bina Two', f.s.sectionA8B); // roll 2
    const c = await admit('Cyra Three', f.s.sectionA8B); // roll 3
    await call(withdraw.POST, { method: 'POST', cookie: admin, params: { id: b.id } });

    const preview = await call(renumber.GET, { cookie: admin, params: { id: f.s.sectionA8B } });
    expect(preview.status).toBe(200);
    // Active: Ali(1)→1, Cyra(3)→2; withdrawn Bina(2)→3.
    expect(preview.json.changes.map((x: { name: string; newRoll: number }) => [x.name, x.newRoll])).toEqual([
      ['Cyra Three', 2],
      ['Bina Two', 3],
    ]);

    const stale = await call(renumber.POST, {
      cookie: admin,
      params: { id: f.s.sectionA8B },
      body: { confirm: true, expectedChanges: 5 },
    });
    expect(stale.status).toBe(409);
    const ok = await call(renumber.POST, {
      cookie: admin,
      params: { id: f.s.sectionA8B },
      body: { confirm: true, expectedChanges: 2 },
    });
    expect(ok.status).toBe(200);
    expect((await studentLogin('sca-8b-cyra-2', c.temporaryPassword)).status).toBe(200);
    expect((await studentLogin(c.username, c.temporaryPassword)).status).toBe(401);
    expect((await systemDb().section.findUniqueOrThrow({ where: { id: f.s.sectionA8B } })).nextRollNumber).toBe(4);
    const audit = await systemDb().auditLog.findFirstOrThrow({ where: { action: 'section.renumber' } });
    expect((audit.metadata as { mapping: unknown[] }).mapping).toHaveLength(2);
    void a;
  });

  it('a Class Incharge can renumber only their own section', async () => {
    const teacher = await cookieFor(f.a.TEACHER);
    expect((await call(renumber.GET, { cookie: teacher, params: { id: f.s.sectionA8A } })).status).toBe(200);
    expect((await call(renumber.GET, { cookie: teacher, params: { id: f.s.sectionA8B } })).status).toBe(403);
  });
});

describe('promotion (spec §5.4)', () => {
  it('moves students, keeps rolls, resolves clashes, regenerates usernames and graduates', async () => {
    const fromB = await admit('Clash Kid', f.s.sectionA8B); // 8-B roll 1, clashes with studentA (8-A roll 1)
    const leaver = await admit('Final Year', f.s.sectionA8A); // roll 2
    const r = await call(promotions.POST, {
      cookie: admin,
      body: {
        fromYearId: f.s.yearA,
        toYearId: f.s.yearA2,
        moves: [
          { studentId: f.s.studentA, action: 'PROMOTE', toSectionId: f.s.sectionA2_9A },
          { studentId: fromB.id, action: 'PROMOTE', toSectionId: f.s.sectionA2_9A },
          { studentId: leaver.id, action: 'GRADUATE' },
        ],
      },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json.summary).toMatchObject({ promote: 2, graduate: 1, rollClashes: 1 });

    const moved = await systemDb().student.findMany({
      where: { sectionId: f.s.sectionA2_9A },
      include: { user: { select: { username: true } } },
      orderBy: { rollNumber: 'asc' },
    });
    expect(moved.map((m) => [m.rollNumber, m.user.username])).toEqual([
      [1, 'sca-9a-student-1'],
      [2, 'sca-9a-clash-2'],
    ]);
    const grad = await systemDb().student.findUniqueOrThrow({ where: { id: leaver.id }, include: { user: true } });
    expect(grad.status).toBe('GRADUATED');
    expect(grad.user.status).toBe('DISABLED');
    expect(await systemDb().job.count({ where: { type: 'promotion', status: 'SUCCEEDED' } })).toBe(1);
    expect(await systemDb().auditLog.count({ where: { action: 'promotion.run' } })).toBe(1);
  });

  it('rejects moves into a section outside the target year', async () => {
    const r = await call(promotions.POST, {
      cookie: admin,
      body: {
        fromYearId: f.s.yearA,
        toYearId: f.s.yearA2,
        moves: [{ studentId: f.s.studentA, action: 'PROMOTE', toSectionId: f.s.sectionA8B }],
      },
    });
    expect(r.status).toBe(422);
  });

  it('copy structure duplicates classes/sections into another year without students', async () => {
    const r = await call(copyStructure.POST, {
      cookie: admin,
      params: { id: f.s.yearA2 },
      body: { fromYearId: f.s.yearA },
    });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ classes: 1, sections: 2 });
    const copied = await systemDb().section.findMany({
      where: { class: { academicYearId: f.s.yearA2, name: '8' } },
      include: { _count: { select: { students: true } } },
    });
    expect(copied.map((s) => s._count.students)).toEqual([0, 0]);
  });
});

describe('accounts', () => {
  it('Admissions Officer may reset a student password but not a teacher’s', async () => {
    const ao = await cookieFor(f.a.ADMISSIONS_OFFICER);
    const ok = await call(studentReset.POST, { method: 'POST', cookie: ao, params: { id: f.s.studentA } });
    expect(ok.status).toBe(200);
    expect(ok.json.temporaryPassword).toBeTruthy();
    const no = await call(userReset.POST, { method: 'POST', cookie: ao, params: { id: f.a.TEACHER.id } });
    expect(no.status).toBe(403);
  });

  it('nobody resets their own password through the admin route', async () => {
    const r = await call(userReset.POST, { method: 'POST', cookie: admin, params: { id: f.a.SCHOOL_ADMIN.id } });
    expect(r.status).toBe(422);
  });

  it('new teachers get sequenced usernames', async () => {
    const one = await call(teachers.POST, { cookie: admin, body: { displayName: 'Sana Iqbal' } });
    const two = await call(teachers.POST, { cookie: admin, body: { displayName: 'Sana Iqbal' } });
    expect([one.json.username, two.json.username]).toEqual(['sca-t-sanaiqbal-1', 'sca-t-sanaiqbal-2']);
  });
});

describe('cross-tenant references are rejected (database triggers)', () => {
  it('cannot make another school’s teacher a Class Incharge', async () => {
    const r = await call(sectionById.PATCH, {
      method: 'PATCH',
      cookie: admin,
      params: { id: f.s.sectionA8A },
      body: { classTeacherId: f.s.teacherB },
    });
    expect(r.status).toBe(404);
    expect((await systemDb().section.findUniqueOrThrow({ where: { id: f.s.sectionA8A } })).classTeacherId).toBe(
      f.s.teacherA,
    );
  });

  it('cannot assign a teacher to another school’s section', async () => {
    const r = await call(assignments.PUT, {
      method: 'PUT',
      cookie: admin,
      params: { id: f.s.teacherA },
      body: { academicYearId: f.s.yearA, assignments: [{ sectionId: f.s.sectionB9B, subjectId: f.s.subjMath }] },
    });
    expect(r.status).toBe(422);
  });

  it('the trigger blocks it even if application checks are bypassed', async () => {
    await expect(
      withTenant({ tenantId: f.tenantA.id }, (tx) =>
        tx.teacherAssignment.create({
          data: { tenantId: f.tenantA.id, teacherId: f.s.teacherA, sectionId: f.s.sectionB9B, subjectId: f.s.subjMath },
        }),
      ),
    ).rejects.toThrow(/cross-tenant reference rejected/);
  });
});
