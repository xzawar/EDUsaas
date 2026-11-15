import { beforeAll, describe, expect, it } from 'vitest';
import * as announcements from '@/app/api/v1/announcements/route';
import * as reminders from '@/app/api/v1/fees/reminders/route';
import * as timetableMe from '@/app/api/v1/timetable/me/route';
import * as users from '@/app/api/v1/users/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Round 4: class notices from teachers, fee reminders, the student timetable and the staff-only list. */

let f: Fixtures;
beforeAll(async () => {
  f = await seedFixtures();
});

describe('notices', () => {
  it('a teacher posts to their own class only; the class sees it', async () => {
    const teacher = await cookieFor(f.a.TEACHER);
    const ok = await call(announcements.POST, {
      cookie: teacher,
      body: {
        title: 'Bring your atlas',
        body: 'Geography test tomorrow',
        audience: 'SECTION',
        sectionId: f.s.sectionA8A,
      },
    });
    expect(ok.status).toBe(201);
    const school = await call(announcements.POST, {
      cookie: teacher,
      body: { title: 'Holiday', body: 'No school', audience: 'EVERYONE' },
    });
    expect(school.status).toBe(403);
    const other = await call(announcements.POST, {
      cookie: teacher,
      body: { title: 'Not mine', body: 'x', audience: 'SECTION', sectionId: f.s.sectionA8B },
    });
    expect(other.status).toBe(403);
    const seen = await call(announcements.GET, { cookie: await cookieFor(f.a.STUDENT) });
    expect(seen.json.items.map((a: { title: string }) => a.title)).toContain('Bring your atlas');
  });
});

describe('fee reminders', () => {
  it('notifies each late student with what they owe; nobody else', async () => {
    const db = systemDb();
    const year = await db.academicYear.findFirstOrThrow({ where: { tenantId: f.tenantA.id, status: 'CURRENT' } });
    await db.invoice.create({
      data: {
        tenantId: f.tenantA.id,
        studentId: f.s.studentA,
        academicYearId: year.id,
        number: 'I-R4-1',
        period: '2026-09',
        issuedOn: new Date('2026-09-01'),
        dueOn: new Date('2026-09-10'),
        subtotalPaisa: 300000n,
        discountPaisa: 0n,
        paidPaisa: 0n,
        status: 'DUE',
      },
    });
    const before = await db.notification.count({ where: { kind: 'fees' } });
    const r = await call(reminders.POST, { cookie: await cookieFor(f.a.ACCOUNTANT), body: {} });
    expect(r.status).toBe(200);
    expect(r.json.sent).toBe(1);
    const n = await db.notification.findFirstOrThrow({ where: { kind: 'fees', userId: f.a.STUDENT.id } });
    expect(n.body).toContain('3,000');
    expect(await db.notification.count({ where: { kind: 'fees' } })).toBe(before + 1);
    // Picking nobody sends nothing.
    expect(
      (await call(reminders.POST, { cookie: await cookieFor(f.a.ACCOUNTANT), body: { studentIds: [] } })).json.sent,
    ).toBe(0);
  });
});

describe('student timetable and staff list', () => {
  it('a student’s lessons show the teacher, not their own class', async () => {
    const db = systemDb();
    const slot = await db.timetableSlot.create({
      data: { tenantId: f.tenantA.id, dayOfWeek: 1, periodNo: 1, startsAt: '08:00', endsAt: '08:40' },
    });
    await db.timetableEntry.create({
      data: {
        tenantId: f.tenantA.id,
        sectionId: f.s.sectionA8A,
        slotId: slot.id,
        subjectId: f.s.subjMath,
        teacherId: f.s.teacherA,
      },
    });
    const t = await call(timetableMe.GET, { cookie: await cookieFor(f.a.STUDENT) });
    const cell = t.json.cells['1:1'].entry;
    expect(cell.subject).toBe('Mathematics');
    expect(cell.teacher).toBeTruthy();
    expect(cell.section).toBeUndefined();
  });
  it('the Staff list leaves students out', async () => {
    const r = await call(users.GET, {
      cookie: await cookieFor(f.a.SCHOOL_ADMIN),
      path: '/api/v1/users?staff=true&limit=50',
    });
    expect(r.status).toBe(200);
    const roles = r.json.items.map((u: { role: string }) => u.role);
    expect(roles).not.toContain('STUDENT');
    expect(roles).toEqual(expect.arrayContaining(['ACCOUNTANT', 'ADMISSIONS_OFFICER']));
  });
});
