import { beforeEach, describe, expect, it } from 'vitest';
import * as batches from '@/app/api/v1/attendance/batches/route';
import * as sheet from '@/app/api/v1/attendance/sheet/route';
import * as attMe from '@/app/api/v1/attendance/me/route';
import * as checkIn from '@/app/api/v1/teacher-attendance/check-in/route';
import * as teacherAtt from '@/app/api/v1/teacher-attendance/route';
import * as leave from '@/app/api/v1/leave/route';
import * as leaveTypes from '@/app/api/v1/leave/types/route';
import * as approvals from '@/app/api/v1/leave/approvals/route';
import * as decision from '@/app/api/v1/leave/[id]/decision/route';
import * as cancel from '@/app/api/v1/leave/[id]/cancel/route';
import * as assessments from '@/app/api/v1/assessments/route';
import * as assessmentById from '@/app/api/v1/assessments/[id]/route';
import * as marks from '@/app/api/v1/assessments/[id]/marks/route';
import * as publish from '@/app/api/v1/assessments/[id]/publish/route';
import * as resultsMe from '@/app/api/v1/results/me/route';
import * as grading from '@/app/api/v1/grading-scheme/route';
import * as remarks from '@/app/api/v1/remarks/route';
import * as remarksQueue from '@/app/api/v1/remarks/queue/route';
import * as moderate from '@/app/api/v1/remarks/[id]/moderate/route';
import * as periods from '@/app/api/v1/timetable/periods/route';
import * as entries from '@/app/api/v1/timetable/entries/route';
import * as ttSection from '@/app/api/v1/timetable/sections/[id]/route';
import * as ttMe from '@/app/api/v1/timetable/me/route';
import * as notifications from '@/app/api/v1/notifications/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Phase 3 behaviour: daily operations (spec §2.4–2.6, §6, §7, §8.6). */

let f: Fixtures;
let admin: string;
let teacher: string;
let student: string;
let principal: string;

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const daysAgo = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const uuid = () => crypto.randomUUID();

beforeEach(async () => {
  f = await seedFixtures();
  [admin, teacher, student, principal] = await Promise.all([
    cookieFor(f.a.SCHOOL_ADMIN),
    cookieFor(f.a.TEACHER),
    cookieFor(f.a.STUDENT),
    cookieFor(f.a.PRINCIPAL),
  ]);
});

const register = (cookie: string, date: string, status = 'PRESENT', clientUuid = uuid(), sectionId = f.s.sectionA8A) =>
  call(batches.POST, { cookie, body: { sectionId, date, clientUuid, records: [{ studentId: f.s.studentA, status }] } });

describe('student attendance (spec §6)', () => {
  it('a resent offline batch is never duplicated (idempotent on clientUuid)', async () => {
    const id = uuid();
    const one = await register(teacher, today(), 'PRESENT', id);
    expect(one.status, JSON.stringify(one.json)).toBe(200);
    expect(one.json).toMatchObject({ duplicate: false, corrected: false });
    const two = await register(teacher, today(), 'PRESENT', id);
    expect(two.json).toMatchObject({ duplicate: true, batchId: one.json.batchId });
    expect(await systemDb().attendanceBatch.count({ where: { sectionId: f.s.sectionA8A } })).toBe(1);
    expect(await systemDb().attendanceRecord.count({ where: { studentId: f.s.studentA } })).toBe(1);
  });

  it('a second submit is a correction: last write wins and the change is audited', async () => {
    await register(teacher, today(), 'PRESENT');
    const fix = await register(teacher, today(), 'ABSENT');
    expect(fix.json).toMatchObject({ corrected: true, changed: 1 });
    const rec = await systemDb().attendanceRecord.findFirstOrThrow({ where: { studentId: f.s.studentA } });
    expect(rec.status).toBe('ABSENT');
    const audit = await systemDb().auditLog.findFirstOrThrow({ where: { action: 'attendance.correct' } });
    expect(audit.metadata).toMatchObject({ changes: [{ student: f.s.studentA, from: 'PRESENT', to: 'ABSENT' }] });
  });

  it('teachers can correct within 3 days; after that only the School Admin can', async () => {
    expect((await register(teacher, daysAgo(3))).status).toBe(200);
    const late = await register(teacher, daysAgo(4));
    expect(late.status).toBe(403);
    expect(late.json.error.message).toMatch(/3-day correction window/);
    expect((await register(admin, daysAgo(40))).status).toBe(200);
  });

  it('no attendance for future dates, and a register only takes students from its own section', async () => {
    expect((await register(admin, '2099-01-01')).status).toBe(422);
    const wrong = await call(batches.POST, {
      cookie: teacher,
      body: {
        sectionId: f.s.sectionA8A,
        date: today(),
        clientUuid: uuid(),
        records: [{ studentId: f.s.studentB, status: 'PRESENT' }],
      },
    });
    expect(wrong.status).toBe(422);
  });

  it('a teacher only reaches sections they teach', async () => {
    expect((await register(teacher, today(), 'PRESENT', uuid(), f.s.sectionA8B)).status).toBe(403);
    const r = await call(sheet.GET, { cookie: teacher, path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8B}` });
    expect(r.status).toBe(404);
  });

  it('batches recorded offline more than an hour ago are flagged as synced late', async () => {
    const r = await call(batches.POST, {
      cookie: teacher,
      body: {
        sectionId: f.s.sectionA8A,
        date: today(),
        clientUuid: uuid(),
        clientRecordedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
        records: [{ studentId: f.s.studentA, status: 'PRESENT' }],
      },
    });
    expect(r.json.syncedLate).toBe(true);
  });

  it('attendance % = (present + late) / (present + late + absent); leave days are excluded', async () => {
    await register(admin, daysAgo(1), 'PRESENT');
    await register(admin, daysAgo(2), 'LATE');
    await register(admin, daysAgo(3), 'ABSENT');
    await register(admin, daysAgo(4), 'LEAVE');
    const r = await call(attMe.GET, { cookie: student });
    expect(r.status).toBe(200);
    expect(r.json.pct).toBeCloseTo(66.7, 1);
  });
});

describe('teacher check-in (spec §6.5)', () => {
  it('checks in once per day; a second tap returns the first time', async () => {
    const one = await call(checkIn.POST, { cookie: teacher, body: {} });
    expect(one.status).toBe(200);
    expect(['PRESENT', 'LATE']).toContain(one.json.status);
    const two = await call(checkIn.POST, { cookie: teacher, body: {} });
    expect(two.json).toMatchObject({ alreadyCheckedIn: true, status: one.json.status });
  });

  it('the School Admin sees the board and can correct any day (audited)', async () => {
    const r = await call(teacherAtt.PUT, {
      method: 'PUT',
      cookie: admin,
      body: { teacherId: f.s.teacherA, date: daysAgo(10), status: 'LEAVE', note: 'Approved by phone' },
    });
    expect(r.status).toBe(200);
    const board = await call(teacherAtt.GET, { cookie: admin, path: `/api/v1/teacher-attendance?date=${daysAgo(10)}` });
    expect(board.json.list[0]).toMatchObject({ status: 'LEAVE', corrected: true });
    expect(await systemDb().auditLog.count({ where: { action: 'teacher_attendance.correct' } })).toBe(1);
  });
});

describe('leave (spec §2.4, §2.6; decision D5)', () => {
  async function typeId(cookie: string) {
    const r = await call(leaveTypes.GET, { cookie });
    return (r.json.items as { id: string; name: string }[]).find((t) => t.name === 'Sick leave')!.id;
  }
  async function apply(cookie: string, from = today(), to = today()) {
    const r = await call(leave.POST, {
      cookie,
      body: { typeId: await typeId(cookie), fromDate: from, toDate: to, reason: 'Fever' },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    return r.json.leave.id as string;
  }

  it('a student request goes to their Class Incharge, who approves it; the student is notified', async () => {
    const id = await apply(student);
    const queue = await call(approvals.GET, { cookie: teacher });
    expect(queue.json.items.map((i: { id: string }) => i.id)).toContain(id);
    const teacherNote = await call(notifications.GET, { cookie: teacher });
    expect(teacherNote.json.items[0].title).toBe('New leave request');

    expect(
      (await call(decision.POST, { cookie: teacher, params: { id }, body: { decision: 'APPROVED' } })).status,
    ).toBe(200);
    const studentNote = await call(notifications.GET, { cookie: student });
    expect(studentNote.json.items[0].title).toBe('Leave approved');
    expect((await call(decision.POST, { cookie: admin, params: { id }, body: { decision: 'REJECTED' } })).status).toBe(
      409,
    );
  });

  it('approved leave pre-fills the register', async () => {
    const id = await apply(student);
    await call(decision.POST, { cookie: teacher, params: { id }, body: { decision: 'APPROVED' } });
    const r = await call(sheet.GET, { cookie: teacher, path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8A}` });
    expect(r.json.students[0]).toMatchObject({ onApprovedLeave: true });
  });

  it('after the age-out, only the School Admin can decide a student request', async () => {
    const id = await apply(student);
    await systemDb().leaveRequest.update({ where: { id }, data: { createdAt: new Date(Date.now() - 49 * 3600_000) } });
    expect((await call(approvals.GET, { cookie: teacher })).json.items).toHaveLength(0);
    expect(
      (await call(decision.POST, { cookie: teacher, params: { id }, body: { decision: 'APPROVED' } })).status,
    ).toBe(403);
    expect((await call(decision.POST, { cookie: admin, params: { id }, body: { decision: 'APPROVED' } })).status).toBe(
      200,
    );
  });

  it('nobody approves their own leave; staff requests go to the Principal or School Admin', async () => {
    const id = await apply(teacher);
    expect(
      (await call(decision.POST, { cookie: teacher, params: { id }, body: { decision: 'APPROVED' } })).status,
    ).toBe(403);
    expect(
      (await call(decision.POST, { cookie: principal, params: { id }, body: { decision: 'APPROVED' } })).status,
    ).toBe(200);

    const own = await apply(admin);
    const r = await call(decision.POST, { cookie: admin, params: { id: own }, body: { decision: 'APPROVED' } });
    expect(r.status).toBe(403);
    expect(r.json.error.message).toMatch(/your own/);
  });

  it('overlapping requests are refused; pending requests can be cancelled by the applicant only', async () => {
    const id = await apply(student, today(), today());
    const dup = await call(leave.POST, {
      cookie: student,
      body: { typeId: await typeId(student), fromDate: today(), toDate: today(), reason: 'Again' },
    });
    expect(dup.status).toBe(409);
    expect((await call(cancel.POST, { method: 'POST', cookie: teacher, params: { id } })).status).toBe(404);
    expect((await call(cancel.POST, { method: 'POST', cookie: student, params: { id } })).status).toBe(200);
    expect((await call(cancel.POST, { method: 'POST', cookie: student, params: { id } })).status).toBe(409);
  });

  it('leave can’t end in the past', async () => {
    const r = await call(leave.POST, {
      cookie: student,
      body: { typeId: await typeId(student), fromDate: daysAgo(5), toDate: daysAgo(4), reason: 'Late' },
    });
    expect(r.status).toBe(422);
  });
});

describe('tests and marks (spec §7)', () => {
  async function setupScheme() {
    const r = await call(grading.PUT, {
      method: 'PUT',
      cookie: admin,
      body: {
        bands: [
          { grade: 'A', min: 80 },
          { grade: 'B', min: 60 },
          { grade: 'F', min: 0 },
        ],
      },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  }
  async function newTest(cookie = teacher, subjectId = f.s.subjMath) {
    return call(assessments.POST, {
      cookie,
      body: { sectionId: f.s.sectionA8A, subjectId, name: 'Unit test', maxMarks: 50, heldOn: today() },
    });
  }

  it('teacher creates and submits; only the School Admin publishes; then the student sees a grade', async () => {
    await setupScheme();
    expect((await newTest(teacher, f.s.subjEng)).status).toBe(403);
    const created = await newTest();
    expect(created.status).toBe(201);
    const id = created.json.assessment.id;

    const save = await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 42 }], submit: true },
    });
    expect(save.json).toMatchObject({ saved: 1, status: 'SUBMITTED' });
    expect((await call(resultsMe.GET, { cookie: student })).json.items).toHaveLength(0);

    expect((await call(publish.POST, { method: 'POST', cookie: teacher, params: { id } })).status).toBe(403);
    expect((await call(publish.POST, { method: 'POST', cookie: principal, params: { id } })).status).toBe(403);
    expect((await call(publish.POST, { method: 'POST', cookie: admin, params: { id } })).status).toBe(200);

    const results = await call(resultsMe.GET, { cookie: student });
    expect(results.json.items[0]).toMatchObject({ score: 42, maxMarks: 50, pct: 84, grade: 'A' });
  });

  it('marks above the maximum, or a score for an absent student, are rejected', async () => {
    await setupScheme();
    const id = (await newTest()).json.assessment.id;
    const over = await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 51 }] },
    });
    expect(over.status).toBe(422);
    const absent = await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 5, absent: true }] },
    });
    expect(absent.status).toBe(422);
  });

  it('teachers can correct submitted marks for 7 days (audited), then only the School Admin can', async () => {
    await setupScheme();
    const id = (await newTest()).json.assessment.id;
    await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 30 }], submit: true },
    });
    const fix = await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 35 }] },
    });
    expect(fix.status).toBe(200);
    expect(await systemDb().auditLog.count({ where: { action: 'marks.correct', entityId: id } })).toBe(1);

    await systemDb().assessment.update({ where: { id }, data: { submittedAt: new Date(Date.now() - 8 * 86400_000) } });
    const late = await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 36 }] },
    });
    expect(late.status).toBe(403);
    const sheetView = await call(assessmentById.GET, { cookie: teacher, params: { id } });
    expect(sheetView.json.assessment.canEdit).toBe(false);
    expect(
      (
        await call(marks.PUT, {
          method: 'PUT',
          cookie: admin,
          params: { id },
          body: { marks: [{ studentId: f.s.studentA, score: 36 }] },
        })
      ).status,
    ).toBe(200);
  });

  it('changing a grading scale that is in use creates a new version; old results keep their grade', async () => {
    await setupScheme();
    const id = (await newTest()).json.assessment.id;
    await call(marks.PUT, {
      method: 'PUT',
      cookie: teacher,
      params: { id },
      body: { marks: [{ studentId: f.s.studentA, score: 35 }], submit: true },
    });
    await call(publish.POST, { method: 'POST', cookie: admin, params: { id } });
    const r = await call(grading.PUT, {
      method: 'PUT',
      cookie: admin,
      body: {
        bands: [
          { grade: 'A', min: 50 },
          { grade: 'F', min: 0 },
        ],
      },
    });
    expect(r.json.newVersion).toBe(true);
    expect((await call(grading.GET, { cookie: teacher })).json.scheme.version).toBe(2);
    const results = await call(resultsMe.GET, { cookie: student });
    expect(results.json.items[0].grade).toBe('B'); // 70% under the original scale
  });

  it('Admissions cannot see marks at all', async () => {
    const ao = await cookieFor(f.a.ADMISSIONS_OFFICER);
    expect((await call(assessments.GET, { cookie: ao })).status).toBe(403);
  });
});

describe('remarks (spec §7.4)', () => {
  it('teacher remarks wait for moderation and are decided once', async () => {
    const r = await call(remarks.POST, {
      cookie: teacher,
      body: { studentId: f.s.studentA, text: 'Works hard in class' },
    });
    expect(r.status).toBe(201);
    expect(r.json.remark.status).toBe('PENDING');
    const queue = await call(remarksQueue.GET, { cookie: admin });
    expect(queue.json.items).toHaveLength(1);
    expect(
      (await call(moderate.POST, { cookie: admin, params: { id: r.json.remark.id }, body: { decision: 'APPROVED' } }))
        .status,
    ).toBe(200);
    expect(
      (await call(moderate.POST, { cookie: admin, params: { id: r.json.remark.id }, body: { decision: 'REJECTED' } }))
        .status,
    ).toBe(409);
  });

  it('teachers can only write about students they teach', async () => {
    const r = await call(remarks.POST, { cookie: teacher, body: { studentId: f.s.studentB, text: 'Not my student' } });
    expect(r.status).toBe(404);
  });
});

describe('timetable (spec §8.6)', () => {
  it('rejects a teacher clash and names it', async () => {
    const grid = await call(ttSection.GET, { cookie: admin, params: { id: f.s.sectionA8A } });
    expect(grid.status).toBe(200);
    const slotId = (Object.values(grid.json.cells) as { slotId: string; isBreak: boolean }[]).find(
      (c) => !c.isBreak,
    )!.slotId;
    const place = (sectionId: string) =>
      call(entries.PUT, {
        method: 'PUT',
        cookie: admin,
        body: { sectionId, slotId, subjectId: f.s.subjMath, teacherId: f.s.teacherA },
      });
    expect((await place(f.s.sectionA8A)).status).toBe(200);
    const clash = await place(f.s.sectionA8B);
    expect(clash.status).toBe(409);
    expect(clash.json.error.message).toMatch(/already teaches 8-A/);
  });

  it('a lesson appears in the teacher’s and the student’s timetable', async () => {
    const grid = await call(ttSection.GET, { cookie: admin, params: { id: f.s.sectionA8A } });
    const slotId = (Object.values(grid.json.cells) as { slotId: string; isBreak: boolean }[]).find(
      (c) => !c.isBreak,
    )!.slotId;
    await call(entries.PUT, {
      method: 'PUT',
      cookie: admin,
      body: { sectionId: f.s.sectionA8A, slotId, subjectId: f.s.subjMath, teacherId: f.s.teacherA },
    });
    for (const cookie of [teacher, student]) {
      const mine = await call(ttMe.GET, { cookie });
      const filled = (Object.values(mine.json.cells) as { entry: unknown }[]).filter((c) => c.entry);
      expect(filled).toHaveLength(1);
    }
  });

  it('a subject not taught in the class cannot be placed; teachers cannot edit the timetable', async () => {
    const grid = await call(ttSection.GET, { cookie: admin, params: { id: f.s.sectionA8A } });
    const slotId = (Object.values(grid.json.cells) as { slotId: string; isBreak: boolean }[]).find(
      (c) => !c.isBreak,
    )!.slotId;
    const bad = await call(entries.PUT, {
      method: 'PUT',
      cookie: admin,
      body: { sectionId: f.s.sectionA8A, slotId, subjectId: f.s.subjB },
    });
    expect(bad.status).toBe(422); // School B's subject is simply not one of this class's subjects
    const t = await call(entries.PUT, {
      method: 'PUT',
      cookie: teacher,
      body: { sectionId: f.s.sectionA8A, slotId, subjectId: f.s.subjMath },
    });
    expect(t.status).toBe(403);
    const p = await call(periods.PUT, {
      method: 'PUT',
      cookie: teacher,
      body: { days: [1], periods: [{ startsAt: '08:00', endsAt: '08:40' }] },
    });
    expect(p.status).toBe(403);
  });
});
