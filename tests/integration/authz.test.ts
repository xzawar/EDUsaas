import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { UserRole } from '@prisma/client';
import * as me from '@/app/api/v1/auth/me/route';
import * as logout from '@/app/api/v1/auth/logout/route';
import * as changePassword from '@/app/api/v1/auth/change-password/route';
import * as users from '@/app/api/v1/users/route';
import * as userById from '@/app/api/v1/users/[id]/route';
import * as settings from '@/app/api/v1/settings/route';
import * as permissions from '@/app/api/v1/settings/permissions/route';
import * as tenants from '@/app/api/v1/platform/tenants/route';
import * as tenantById from '@/app/api/v1/platform/tenants/[id]/route';
import * as health from '@/app/api/v1/platform/health/route';
import * as years from '@/app/api/v1/academic-years/route';
import * as yearById from '@/app/api/v1/academic-years/[id]/route';
import * as yearStructure from '@/app/api/v1/academic-years/[id]/structure/route';
import * as yearCopy from '@/app/api/v1/academic-years/[id]/copy-structure/route';
import * as classes from '@/app/api/v1/classes/route';
import * as classById from '@/app/api/v1/classes/[id]/route';
import * as classSubjects from '@/app/api/v1/classes/[id]/subjects/route';
import * as sections from '@/app/api/v1/sections/route';
import * as sectionById from '@/app/api/v1/sections/[id]/route';
import * as renumber from '@/app/api/v1/sections/[id]/renumber/route';
import * as subjects from '@/app/api/v1/subjects/route';
import * as subjectById from '@/app/api/v1/subjects/[id]/route';
import * as teachers from '@/app/api/v1/teachers/route';
import * as teacherById from '@/app/api/v1/teachers/[id]/route';
import * as teacherAssignments from '@/app/api/v1/teachers/[id]/assignments/route';
import * as staff from '@/app/api/v1/staff/route';
import * as userReset from '@/app/api/v1/users/[id]/reset-password/route';
import * as userStatus from '@/app/api/v1/users/[id]/status/route';
import * as students from '@/app/api/v1/students/route';
import * as studentById from '@/app/api/v1/students/[id]/route';
import * as studentTransfer from '@/app/api/v1/students/[id]/transfer/route';
import * as studentWithdraw from '@/app/api/v1/students/[id]/withdraw/route';
import * as studentRestore from '@/app/api/v1/students/[id]/restore/route';
import * as studentReset from '@/app/api/v1/students/[id]/reset-password/route';
import * as promotions from '@/app/api/v1/promotions/route';
import * as promotionPreview from '@/app/api/v1/promotions/preview/route';
import * as attSheet from '@/app/api/v1/attendance/sheet/route';
import * as attBatches from '@/app/api/v1/attendance/batches/route';
import * as attGrid from '@/app/api/v1/attendance/grid/route';
import * as attRecords from '@/app/api/v1/attendance/records/route';
import * as attMe from '@/app/api/v1/attendance/me/route';
import * as checkIn from '@/app/api/v1/teacher-attendance/check-in/route';
import * as teacherAtt from '@/app/api/v1/teacher-attendance/route';
import * as leave from '@/app/api/v1/leave/route';
import * as leaveTypes from '@/app/api/v1/leave/types/route';
import * as leaveApprovals from '@/app/api/v1/leave/approvals/route';
import * as leaveDecision from '@/app/api/v1/leave/[id]/decision/route';
import * as leaveCancel from '@/app/api/v1/leave/[id]/cancel/route';
import * as assessments from '@/app/api/v1/assessments/route';
import * as assessmentById from '@/app/api/v1/assessments/[id]/route';
import * as assessmentMarks from '@/app/api/v1/assessments/[id]/marks/route';
import * as assessmentPublish from '@/app/api/v1/assessments/[id]/publish/route';
import * as resultsMe from '@/app/api/v1/results/me/route';
import * as grading from '@/app/api/v1/grading-scheme/route';
import * as remarks from '@/app/api/v1/remarks/route';
import * as remarksQueue from '@/app/api/v1/remarks/queue/route';
import * as remarkModerate from '@/app/api/v1/remarks/[id]/moderate/route';
import * as ttPeriods from '@/app/api/v1/timetable/periods/route';
import * as ttEntries from '@/app/api/v1/timetable/entries/route';
import * as ttMe from '@/app/api/v1/timetable/me/route';
import * as ttSection from '@/app/api/v1/timetable/sections/[id]/route';
import * as notifications from '@/app/api/v1/notifications/route';
import * as imports from '@/app/api/v1/imports/route';
import * as importStudents from '@/app/api/v1/imports/students/route';
import * as importTemplate from '@/app/api/v1/imports/students/template/route';
import * as importById from '@/app/api/v1/imports/[id]/route';
import * as importCommit from '@/app/api/v1/imports/[id]/commit/route';
import * as repAttendance from '@/app/api/v1/reports/attendance/route';
import * as repMarks from '@/app/api/v1/reports/marks/route';
import * as repAtRisk from '@/app/api/v1/reports/at-risk/route';
import * as searchRoute from '@/app/api/v1/search/route';
import * as announcements from '@/app/api/v1/announcements/route';
import * as announcementById from '@/app/api/v1/announcements/[id]/route';
import * as auditLogs from '@/app/api/v1/audit-logs/route';
import * as tenantSupport from '@/app/api/v1/platform/tenants/[id]/support/route';
import * as tenantSupportView from '@/app/api/v1/platform/tenants/[id]/support/view/route';
import * as tenantAdminReset from '@/app/api/v1/platform/tenants/[id]/admin-reset/route';
import * as supportGrants from '@/app/api/v1/support-grants/route';
import * as supportDecision from '@/app/api/v1/support-grants/[id]/decision/route';
import * as reportCard from '@/app/api/v1/students/[id]/report-card/route';
import * as reportCardMe from '@/app/api/v1/report-card/me/route';
import { systemDb } from '@/server/db/system';
import { cookieFor, seedFixtures, type FixtureUser, type Fixtures } from './helpers/fixtures';
import { call, type CallOptions } from './helpers/http';

/**
 * Authorization matrix (spec §9.2, plan §10): every protected endpoint × every role.
 * Adding a route without adding it here fails the coverage test at the bottom.
 */

type Handler = Parameters<typeof call>[0];
type Expect = number | 'ok';
type Row = {
  key: string;
  handler: Handler;
  request: (f: Fixtures) => CallOptions;
  expect: Record<UserRole, Expect>;
};

const ROLES: UserRole[] = [
  'STUDENT',
  'TEACHER',
  'ADMISSIONS_OFFICER',
  'PRINCIPAL',
  'SCHOOL_ADMIN',
  'PLATFORM_ADMIN',
  'PLATFORM_OWNER',
];
const only = (allowed: Partial<Record<UserRole, Expect>>, otherwise: number = 403): Record<UserRole, Expect> =>
  Object.fromEntries(ROLES.map((r) => [r, allowed[r] ?? otherwise])) as Record<UserRole, Expect>;
const everyone = (v: Expect) => only({}, v as number) as Record<UserRole, Expect>;

const STAFF_ANY = only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, ADMISSIONS_OFFICER: 200, TEACHER: 200 });
let prefixCounter = 0;
let n = 0;
const MISSING = '00000000-0000-4000-8000-000000000000';

const MATRIX: Row[] = [
  { key: 'GET /api/v1/auth/me', handler: me.GET, request: () => ({}), expect: everyone(200) },
  { key: 'POST /api/v1/auth/logout', handler: logout.POST, request: () => ({ method: 'POST' }), expect: everyone(200) },
  {
    key: 'POST /api/v1/auth/change-password',
    handler: changePassword.POST,
    // Wrong current password: proves the route is reachable for every signed-in role without changing anything.
    request: () => ({ body: { currentPassword: 'not-it-1', newPassword: 'Whatever-pass-1' } }),
    expect: everyone(422),
  },
  {
    key: 'GET /api/v1/users',
    handler: users.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'GET /api/v1/users/[id]',
    handler: userById.GET,
    request: (f) => ({ params: { id: f.a.TEACHER.id } }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  { key: 'GET /api/v1/settings', handler: settings.GET, request: () => ({}), expect: only({ SCHOOL_ADMIN: 200 }) },
  {
    key: 'PATCH /api/v1/settings',
    handler: settings.PATCH,
    request: () => ({ method: 'PATCH', body: { atRiskThreshold: 70 } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/settings/permissions',
    handler: permissions.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'PUT /api/v1/settings/permissions',
    handler: permissions.PUT,
    request: () => ({
      method: 'PUT',
      body: { changes: [{ role: 'PRINCIPAL', permission: 'reports.read', granted: true }] },
    }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/platform/tenants',
    handler: tenants.GET,
    request: () => ({}),
    expect: only({ PLATFORM_OWNER: 200 }),
  },
  {
    key: 'POST /api/v1/platform/tenants',
    handler: tenants.POST,
    request: () => {
      const n = ++prefixCounter;
      return {
        body: {
          name: `New School ${n}`,
          prefix: `new${n}`,
          admin: { displayName: 'Head', email: `head${n}@new.test` },
        },
      };
    },
    expect: only({ PLATFORM_OWNER: 201 }),
  },
  {
    key: 'PATCH /api/v1/platform/tenants/[id]',
    handler: tenantById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.tenantB.id }, body: { status: 'ACTIVE' } }),
    expect: only({ PLATFORM_OWNER: 200 }),
  },
  {
    key: 'GET /api/v1/platform/health',
    handler: health.GET,
    request: () => ({}),
    expect: only({ PLATFORM_OWNER: 200, PLATFORM_ADMIN: 200 }),
  },
  // ── Phase 2: structure ────────────────────────────────────────────────────
  { key: 'GET /api/v1/academic-years', handler: years.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'POST /api/v1/academic-years',
    handler: years.POST,
    request: () => ({ body: { name: `Y-${++n}`, startsOn: '2030-04-01', endsOn: '2031-03-31' } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'PATCH /api/v1/academic-years/[id]',
    handler: yearById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.yearA }, body: { name: '2026-27' } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/academic-years/[id]/structure',
    handler: yearStructure.GET,
    request: (f) => ({ params: { id: f.s.yearA } }),
    expect: STAFF_ANY,
  },
  {
    key: 'POST /api/v1/academic-years/[id]/copy-structure',
    handler: yearCopy.POST,
    request: (f) => ({ params: { id: f.s.yearA2 }, body: { fromYearId: f.s.yearA } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'POST /api/v1/classes',
    handler: classes.POST,
    request: (f) => ({ body: { academicYearId: f.s.yearA, name: `C${++n}`, gradeLevel: 5, sections: ['A'] } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'PATCH /api/v1/classes/[id]',
    handler: classById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.classA8 }, body: { gradeLevel: 8 } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'DELETE /api/v1/classes/[id]',
    handler: classById.DELETE,
    // Class 8 has students, so an authorised caller gets 409 and nothing is deleted.
    request: (f) => ({ method: 'DELETE', params: { id: f.s.classA8 } }),
    expect: only({ SCHOOL_ADMIN: 409 }),
  },
  {
    key: 'PUT /api/v1/classes/[id]/subjects',
    handler: classSubjects.PUT,
    request: (f) => ({ method: 'PUT', params: { id: f.s.classA8 }, body: { subjectIds: [f.s.subjMath, f.s.subjEng] } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  { key: 'GET /api/v1/sections', handler: sections.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'POST /api/v1/sections',
    handler: sections.POST,
    request: (f) => ({ body: { classId: f.s.classA8, name: `S${++n}` } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'PATCH /api/v1/sections/[id]',
    handler: sectionById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.sectionA8A }, body: { capacity: 30 } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'DELETE /api/v1/sections/[id]',
    handler: sectionById.DELETE,
    request: (f) => ({ method: 'DELETE', params: { id: f.s.sectionA8A } }),
    expect: only({ SCHOOL_ADMIN: 409 }),
  },
  {
    key: 'GET /api/v1/sections/[id]/renumber',
    handler: renumber.GET,
    // School Admin, or the section's own Class Incharge (the fixture teacher is 8-A's incharge).
    request: (f) => ({ params: { id: f.s.sectionA8A } }),
    expect: only({ SCHOOL_ADMIN: 200, TEACHER: 200 }),
  },
  {
    key: 'POST /api/v1/sections/[id]/renumber',
    handler: renumber.POST,
    request: (f) => ({ params: { id: f.s.sectionA8A }, body: { confirm: true, expectedChanges: 999 } }),
    expect: only({ SCHOOL_ADMIN: 409, TEACHER: 409 }),
  },
  { key: 'GET /api/v1/subjects', handler: subjects.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'POST /api/v1/subjects',
    handler: subjects.POST,
    request: () => ({ body: { name: `Subject ${++n}` } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'PATCH /api/v1/subjects/[id]',
    handler: subjectById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.subjMath }, body: { code: 'MATH' } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  // ── Phase 2: people ───────────────────────────────────────────────────────
  {
    key: 'GET /api/v1/teachers',
    handler: teachers.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'POST /api/v1/teachers',
    handler: teachers.POST,
    request: () => ({ body: { displayName: `Teacher ${++n}` } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'GET /api/v1/teachers/[id]',
    handler: teacherById.GET,
    request: (f) => ({ params: { id: f.s.teacherA } }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'PATCH /api/v1/teachers/[id]',
    handler: teacherById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.teacherA }, body: { phone: '0300 1234567' } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'PUT /api/v1/teachers/[id]/assignments',
    handler: teacherAssignments.PUT,
    request: (f) => ({
      method: 'PUT',
      params: { id: f.s.teacherA },
      body: { academicYearId: f.s.yearA, assignments: [{ sectionId: f.s.sectionA8A, subjectId: f.s.subjMath }] },
    }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'POST /api/v1/staff',
    handler: staff.POST,
    request: () => ({ body: { role: 'PRINCIPAL', displayName: 'Deputy', email: `deputy${++n}@a.test` } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  {
    key: 'POST /api/v1/users/[id]/reset-password',
    handler: userReset.POST,
    // Target the student: resetting forces a password change, which would block that user's later matrix rows.
    request: (f) => ({ method: 'POST', params: { id: f.a.STUDENT.id } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'PATCH /api/v1/users/[id]/status',
    handler: userStatus.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.a.PRINCIPAL.id }, body: { status: 'ACTIVE' } }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/students',
    handler: students.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, ADMISSIONS_OFFICER: 200, TEACHER: 200 }),
  },
  {
    key: 'POST /api/v1/students',
    handler: students.POST,
    request: (f) => ({ body: { displayName: `Pupil ${++n}`, sectionId: f.s.sectionA8B } }),
    // Principal can't add students unless the School Admin enables it (default off).
    expect: only({ SCHOOL_ADMIN: 201, ADMISSIONS_OFFICER: 201 }),
  },
  {
    key: 'GET /api/v1/students/[id]',
    handler: studentById.GET,
    request: (f) => ({ params: { id: f.s.studentA } }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, ADMISSIONS_OFFICER: 200, TEACHER: 200 }),
  },
  {
    key: 'PATCH /api/v1/students/[id]',
    handler: studentById.PATCH,
    request: (f) => ({ method: 'PATCH', params: { id: f.s.studentA }, body: { address: 'Street 1' } }),
    expect: only({ SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'POST /api/v1/students/[id]/transfer',
    handler: studentTransfer.POST,
    // Same section → 422 for authorised callers; nothing moves.
    request: (f) => ({ params: { id: f.s.studentA }, body: { sectionId: f.s.sectionA8A } }),
    expect: only({ SCHOOL_ADMIN: 422, ADMISSIONS_OFFICER: 422 }),
  },
  {
    key: 'POST /api/v1/students/[id]/withdraw',
    handler: studentWithdraw.POST,
    request: () => ({ method: 'POST', params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, ADMISSIONS_OFFICER: 404 }),
  },
  {
    key: 'POST /api/v1/students/[id]/restore',
    handler: studentRestore.POST,
    request: (f) => ({ method: 'POST', params: { id: f.s.studentA } }),
    expect: only({ SCHOOL_ADMIN: 422, ADMISSIONS_OFFICER: 422 }),
  },
  {
    key: 'POST /api/v1/students/[id]/reset-password',
    handler: studentReset.POST,
    request: (f) => ({ method: 'POST', params: { id: f.s.studentA } }),
    expect: only({ SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  // ── Phase 2: promotion ────────────────────────────────────────────────────
  { key: 'GET /api/v1/promotions', handler: promotions.GET, request: () => ({}), expect: only({ SCHOOL_ADMIN: 200 }) },
  {
    key: 'POST /api/v1/promotions',
    handler: promotions.POST,
    request: (f) => ({ body: { fromYearId: f.s.yearA, toYearId: f.s.yearA2, moves: [] } }),
    expect: only({ SCHOOL_ADMIN: 422 }),
  },
  {
    key: 'POST /api/v1/promotions/preview',
    handler: promotionPreview.POST,
    request: (f) => ({
      body: {
        fromYearId: f.s.yearA,
        toYearId: f.s.yearA2,
        moves: [{ studentId: f.s.studentA, action: 'PROMOTE', toSectionId: f.s.sectionA2_9A }],
      },
    }),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  // ── Phase 3: attendance ───────────────────────────────────────────────────
  {
    key: 'GET /api/v1/attendance/sheet',
    handler: attSheet.GET,
    request: (f) => ({ path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8A}` }),
    // Admissions has neither attendance.submit nor attendance.oversee: the section is invisible to them.
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 200, ADMISSIONS_OFFICER: 404 }),
  },
  {
    key: 'POST /api/v1/attendance/batches',
    handler: attBatches.POST,
    // Unknown section + unknown student: overseers reach validation (422); others are out of scope (403).
    request: () => ({
      body: {
        sectionId: MISSING,
        date: '2026-09-01',
        clientUuid: crypto.randomUUID(),
        records: [{ studentId: MISSING, status: 'PRESENT' }],
      },
    }),
    expect: only({ SCHOOL_ADMIN: 422, PRINCIPAL: 422 }),
  },
  {
    key: 'GET /api/v1/attendance/grid',
    handler: attGrid.GET,
    request: (f) => ({ path: `/api/v1/attendance/grid?sectionId=${f.s.sectionA8A}&month=2026-09` }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 200, ADMISSIONS_OFFICER: 404 }),
  },
  {
    key: 'POST /api/v1/attendance/records',
    handler: attRecords.POST,
    // A day long past: only overseers may still change it; the teacher's 3-day window is closed.
    request: (f) => ({
      body: { sectionId: f.s.sectionA8A, date: '2026-04-02', studentId: f.s.studentA, status: 'LATE' },
    }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 403, ADMISSIONS_OFFICER: 404 }),
  },
  { key: 'GET /api/v1/attendance/me', handler: attMe.GET, request: () => ({}), expect: only({ STUDENT: 200 }) },
  {
    key: 'POST /api/v1/teacher-attendance/check-in',
    handler: checkIn.POST,
    request: () => ({ body: {} }),
    expect: only({ TEACHER: 200 }),
  },
  {
    key: 'GET /api/v1/teacher-attendance',
    handler: teacherAtt.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'PUT /api/v1/teacher-attendance',
    handler: teacherAtt.PUT,
    request: () => ({ method: 'PUT', body: { teacherId: MISSING, date: '2026-09-01', status: 'PRESENT' } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404 }),
  },
  // ── Phase 3: leave ────────────────────────────────────────────────────────
  {
    key: 'GET /api/v1/leave',
    handler: leave.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'POST /api/v1/leave',
    handler: leave.POST,
    // Unknown leave type → 422 for everyone allowed to apply; nothing is created.
    request: () => ({
      body: { typeId: MISSING, fromDate: '2099-01-01', toDate: '2099-01-02', reason: 'Matrix check' },
    }),
    expect: only({ STUDENT: 422, TEACHER: 422, PRINCIPAL: 422, SCHOOL_ADMIN: 422 }),
  },
  {
    key: 'GET /api/v1/leave/types',
    handler: leaveTypes.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'POST /api/v1/leave/types',
    handler: leaveTypes.POST,
    request: () => ({ body: { name: `Matrix leave ${++n}` } }),
    expect: only({ SCHOOL_ADMIN: 201 }),
  },
  { key: 'GET /api/v1/leave/approvals', handler: leaveApprovals.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'POST /api/v1/leave/[id]/decision',
    handler: leaveDecision.POST,
    request: () => ({ params: { id: MISSING }, body: { decision: 'APPROVED' } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404, ADMISSIONS_OFFICER: 404, TEACHER: 404 }),
  },
  {
    key: 'POST /api/v1/leave/[id]/cancel',
    handler: leaveCancel.POST,
    request: () => ({ method: 'POST', params: { id: MISSING } }),
    expect: only({ STUDENT: 404, TEACHER: 404, PRINCIPAL: 404, SCHOOL_ADMIN: 404 }),
  },
  // ── Phase 3: tests, marks, grading, remarks ───────────────────────────────
  {
    key: 'GET /api/v1/assessments',
    handler: assessments.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 200 }),
  },
  {
    key: 'POST /api/v1/assessments',
    handler: assessments.POST,
    // English in 8-A: the fixture teacher teaches only Mathematics there.
    request: (f) => ({
      body: {
        sectionId: f.s.sectionA8A,
        subjectId: f.s.subjEng,
        name: 'Matrix test',
        maxMarks: 10,
        heldOn: '2099-01-01',
      },
    }),
    expect: only({ SCHOOL_ADMIN: 422 }),
  },
  {
    key: 'GET /api/v1/assessments/[id]',
    handler: assessmentById.GET,
    request: () => ({ params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404, ADMISSIONS_OFFICER: 404, TEACHER: 404 }),
  },
  {
    key: 'DELETE /api/v1/assessments/[id]',
    handler: assessmentById.DELETE,
    request: () => ({ method: 'DELETE', params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404, ADMISSIONS_OFFICER: 404, TEACHER: 404 }),
  },
  {
    key: 'PUT /api/v1/assessments/[id]/marks',
    handler: assessmentMarks.PUT,
    request: () => ({ method: 'PUT', params: { id: MISSING }, body: { marks: [], submit: false } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404, ADMISSIONS_OFFICER: 404, TEACHER: 404 }),
  },
  {
    key: 'POST /api/v1/assessments/[id]/publish',
    handler: assessmentPublish.POST,
    request: () => ({ method: 'POST', params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404 }),
  },
  { key: 'GET /api/v1/results/me', handler: resultsMe.GET, request: () => ({}), expect: only({ STUDENT: 200 }) },
  { key: 'GET /api/v1/grading-scheme', handler: grading.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'PUT /api/v1/grading-scheme',
    handler: grading.PUT,
    // Only one band: invalid, so nothing changes.
    request: () => ({ method: 'PUT', body: { bands: [{ grade: 'A', min: 0 }] } }),
    expect: only({ SCHOOL_ADMIN: 422 }),
  },
  {
    key: 'POST /api/v1/remarks',
    handler: remarks.POST,
    request: () => ({ body: { studentId: MISSING, text: 'Matrix remark' } }),
    expect: only({ SCHOOL_ADMIN: 404, TEACHER: 404 }),
  },
  { key: 'GET /api/v1/remarks/queue', handler: remarksQueue.GET, request: () => ({}), expect: STAFF_ANY },
  {
    key: 'POST /api/v1/remarks/[id]/moderate',
    handler: remarkModerate.POST,
    request: () => ({ params: { id: MISSING }, body: { decision: 'APPROVED' } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404, ADMISSIONS_OFFICER: 404, TEACHER: 404 }),
  },
  // ── Phase 3: timetable & notifications ────────────────────────────────────
  {
    key: 'GET /api/v1/timetable/periods',
    handler: ttPeriods.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'PUT /api/v1/timetable/periods',
    handler: ttPeriods.PUT,
    request: () => ({ method: 'PUT', body: { days: [], periods: [] } }),
    expect: only({ SCHOOL_ADMIN: 422 }),
  },
  {
    key: 'PUT /api/v1/timetable/entries',
    handler: ttEntries.PUT,
    request: (f) => ({ method: 'PUT', body: { sectionId: f.s.sectionA8A, slotId: MISSING, subjectId: null } }),
    expect: only({ SCHOOL_ADMIN: 404 }),
  },
  {
    key: 'GET /api/v1/timetable/me',
    handler: ttMe.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/timetable/sections/[id]',
    handler: ttSection.GET,
    request: (f) => ({ params: { id: f.s.sectionA8A } }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 200 }),
  },
  {
    key: 'GET /api/v1/notifications',
    handler: notifications.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'POST /api/v1/notifications',
    handler: notifications.POST,
    request: () => ({ body: {} }),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  // ── Phase 4: import, reports, search, announcements, audit ────────────────
  {
    key: 'GET /api/v1/imports',
    handler: imports.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'POST /api/v1/imports/students',
    handler: importStudents.POST,
    // A CSV without the template's columns → 422; nothing is stored.
    request: () => ({
      body: { fileName: 'x.csv', data: Buffer.from('hello\n1').toString('base64'), clientKey: crypto.randomUUID() },
    }),
    expect: only({ SCHOOL_ADMIN: 422, ADMISSIONS_OFFICER: 422 }),
  },
  {
    key: 'GET /api/v1/imports/students/template',
    handler: importTemplate.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'GET /api/v1/imports/[id]',
    handler: importById.GET,
    request: () => ({ params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, ADMISSIONS_OFFICER: 404 }),
  },
  {
    key: 'POST /api/v1/imports/[id]/commit',
    handler: importCommit.POST,
    request: () => ({ method: 'POST', params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, ADMISSIONS_OFFICER: 404 }),
  },
  {
    key: 'GET /api/v1/reports/attendance',
    handler: repAttendance.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'GET /api/v1/reports/marks',
    handler: repMarks.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'GET /api/v1/reports/at-risk',
    handler: repAtRisk.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  {
    key: 'GET /api/v1/search',
    handler: searchRoute.GET,
    request: () => ({ path: '/api/v1/search?q=student' }),
    expect: only({ TEACHER: 200, PRINCIPAL: 200, ADMISSIONS_OFFICER: 200, SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'GET /api/v1/announcements',
    handler: announcements.GET,
    request: () => ({}),
    expect: only({ STUDENT: 200, TEACHER: 200, PRINCIPAL: 200, SCHOOL_ADMIN: 200, ADMISSIONS_OFFICER: 200 }),
  },
  {
    key: 'POST /api/v1/announcements',
    handler: announcements.POST,
    request: () => ({ body: { title: 'x', body: 'Matrix', audience: 'EVERYONE' } }),
    expect: only({ SCHOOL_ADMIN: 422, PRINCIPAL: 422 }),
  },
  {
    key: 'DELETE /api/v1/announcements/[id]',
    handler: announcementById.DELETE,
    request: () => ({ method: 'DELETE', params: { id: MISSING } }),
    expect: only({ SCHOOL_ADMIN: 404, PRINCIPAL: 404 }),
  },
  {
    key: 'GET /api/v1/audit-logs',
    handler: auditLogs.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200 }),
  },
  // ── Phase 5: support access, report cards ─────────────────────────────────
  {
    key: 'GET /api/v1/platform/tenants/[id]/support',
    handler: tenantSupport.GET,
    request: (f) => ({ params: { id: f.tenantA.id } }),
    expect: only({ PLATFORM_OWNER: 200 }),
  },
  {
    key: 'POST /api/v1/platform/tenants/[id]/support',
    handler: tenantSupport.POST,
    request: (f) => ({ params: { id: f.tenantA.id }, body: { reason: 'short', durationMinutes: 60 } }),
    expect: only({ PLATFORM_OWNER: 422 }),
  },
  {
    key: 'DELETE /api/v1/platform/tenants/[id]/support',
    handler: tenantSupport.DELETE,
    request: (f) => ({ method: 'DELETE', params: { id: f.tenantA.id } }),
    expect: only({ PLATFORM_OWNER: 404 }),
  },
  {
    key: 'GET /api/v1/platform/tenants/[id]/support/view',
    handler: tenantSupportView.GET,
    // No grant: even the owner is refused. That is the point.
    request: (f) => ({ params: { id: f.tenantA.id } }),
    expect: only({}),
  },
  {
    key: 'POST /api/v1/platform/tenants/[id]/admin-reset',
    handler: tenantAdminReset.POST,
    request: (f) => ({
      params: { id: f.tenantA.id },
      body: { userId: f.a.SCHOOL_ADMIN.id, reason: 'Matrix check only', confirm: 'NO' },
    }),
    expect: only({ PLATFORM_OWNER: 422 }),
  },
  {
    key: 'GET /api/v1/support-grants',
    handler: supportGrants.GET,
    request: () => ({}),
    expect: only({ SCHOOL_ADMIN: 200 }),
  },
  {
    key: 'POST /api/v1/support-grants/[id]/decision',
    handler: supportDecision.POST,
    request: () => ({ params: { id: MISSING }, body: { decision: 'APPROVE' } }),
    expect: only({ SCHOOL_ADMIN: 404 }),
  },
  {
    key: 'GET /api/v1/students/[id]/report-card',
    handler: reportCard.GET,
    request: (f) => ({ params: { id: f.s.studentA } }),
    expect: only({ SCHOOL_ADMIN: 200, PRINCIPAL: 200, TEACHER: 200 }),
  },
  { key: 'GET /api/v1/report-card/me', handler: reportCardMe.GET, request: () => ({}), expect: only({ STUDENT: 200 }) },
];

/** Public or secret-protected routes, tested in auth.test.ts. */
const NOT_IN_MATRIX = new Set([
  'POST /api/v1/auth/[portal]/login',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/reset-password',
  'GET /api/internal/cron/daily',
]);

let f: Fixtures;
beforeAll(async () => {
  f = await seedFixtures();
});

const actor = (role: UserRole): FixtureUser =>
  role === 'PLATFORM_OWNER' ? f.owner : role === 'PLATFORM_ADMIN' ? f.platformAdmin : f.a[role as keyof Fixtures['a']];

describe('authorization matrix', () => {
  for (const row of MATRIX) {
    describe(row.key, () => {
      // Earlier rows reset passwords (which forces a change); start every row from signed-in, settled accounts.
      beforeAll(async () => {
        await systemDb().user.updateMany({ where: { mustChangePassword: true }, data: { mustChangePassword: false } });
      });
      it('rejects anonymous requests with 401', async () => {
        const r = await call(row.handler, row.request(f));
        expect(r.status).toBe(401);
      });
      for (const role of ROLES) {
        it(`${role} → ${row.expect[role]}`, async () => {
          const r = await call(row.handler, { ...row.request(f), cookie: await cookieFor(actor(role)) });
          expect(r.status, JSON.stringify(r.json)).toBe(row.expect[role]);
        });
      }
    });
  }
});

describe('cross-tenant access is rejected and logged (Phase 1 acceptance)', () => {
  it('School A admin cannot read a School B user; the attempt is audited in School A', async () => {
    const r = await call(userById.GET, { params: { id: f.b.STUDENT.id }, cookie: await cookieFor(f.a.SCHOOL_ADMIN) });
    expect(r.status).toBe(404);
    const audit = await systemDb().auditLog.findFirst({
      where: { action: 'access.not_found', entityId: f.b.STUDENT.id },
    });
    expect(audit).toMatchObject({ tenantId: f.tenantA.id, actorId: f.a.SCHOOL_ADMIN.id, outcome: 'denied' });
  });

  it('user lists never include another school', async () => {
    const r = await call(users.GET, { cookie: await cookieFor(f.a.SCHOOL_ADMIN) });
    const ids = (r.json.items as { id: string }[]).map((u) => u.id);
    expect(ids).not.toContain(f.b.SCHOOL_ADMIN.id);
    const tenants = await systemDb().user.findMany({ where: { id: { in: ids } }, select: { tenantId: true } });
    expect(new Set(tenants.map((t) => t.tenantId))).toEqual(new Set([f.tenantA.id]));
  });

  it('settings changes only affect the caller’s school', async () => {
    await call(settings.PATCH, {
      method: 'PATCH',
      body: { atRiskThreshold: 60 },
      cookie: await cookieFor(f.a.SCHOOL_ADMIN),
    });
    const b = await systemDb().tenantSettings.findUniqueOrThrow({ where: { tenantId: f.tenantB.id } });
    expect(b.atRiskThreshold).toBe(75);
  });

  it('request bodies cannot smuggle a tenant id', async () => {
    const r = await call(settings.PATCH, {
      method: 'PATCH',
      body: { atRiskThreshold: 50, tenantId: f.tenantB.id },
      cookie: await cookieFor(f.a.SCHOOL_ADMIN),
    });
    expect(r.status).toBe(422);
  });

  it('denied route access is audited', async () => {
    await call(settings.GET, { cookie: await cookieFor(f.a.TEACHER) });
    const audit = await systemDb().auditLog.findFirst({ where: { action: 'access.denied', actorId: f.a.TEACHER.id } });
    expect(audit?.entityId).toBe('GET /api/v1/test');
  });

  it('a platform-portal session cannot use school APIs even if the role had permission', async () => {
    // Defence in depth: a STAFF-portal role presented with a PLATFORM-portal session is rejected.
    const r = await call(users.GET, { cookie: await cookieFor(f.a.SCHOOL_ADMIN, 'PLATFORM') });
    expect(r.status).toBe(403);
  });
});

describe('Principal permissions are configured per school (spec §2.2)', () => {
  it('toggling a permission changes access immediately and is audited', async () => {
    const admin = await cookieFor(f.a.SCHOOL_ADMIN);
    const principal = await cookieFor(f.a.PRINCIPAL);
    expect((await call(users.GET, { cookie: principal })).status).toBe(200);

    const off = await call(permissions.PUT, {
      method: 'PUT',
      cookie: admin,
      body: { changes: [{ role: 'PRINCIPAL', permission: 'users.read', granted: false }] },
    });
    expect(off.status).toBe(200);
    expect((await call(users.GET, { cookie: principal })).status).toBe(403);

    const audit = await systemDb().auditLog.findFirst({
      where: { action: 'permissions.update', entityId: 'PRINCIPAL:users.read' },
    });
    expect(audit).toMatchObject({ before: { granted: true }, after: { granted: false }, tenantId: f.tenantA.id });

    await call(permissions.PUT, {
      method: 'PUT',
      cookie: admin,
      body: { changes: [{ role: 'PRINCIPAL', permission: 'users.read', granted: true }] },
    });
    expect((await call(users.GET, { cookie: principal })).status).toBe(200);
  });

  it('School B is unaffected by School A toggles', async () => {
    await call(permissions.PUT, {
      method: 'PUT',
      cookie: await cookieFor(f.a.SCHOOL_ADMIN),
      body: { changes: [{ role: 'PRINCIPAL', permission: 'promotion.run', granted: true }] },
    });
    const bRows = await systemDb().tenantRolePermission.count({ where: { tenantId: f.tenantB.id } });
    expect(bRows).toBe(0);
  });

  it('cannot grant non-configurable permissions or configure fixed roles', async () => {
    const admin = await cookieFor(f.a.SCHOOL_ADMIN);
    for (const change of [
      { role: 'PRINCIPAL', permission: 'settings.manage', granted: true },
      { role: 'TEACHER', permission: 'users.read', granted: true },
      { role: 'SCHOOL_ADMIN', permission: 'users.read', granted: false },
    ]) {
      const r = await call(permissions.PUT, { method: 'PUT', cookie: admin, body: { changes: [change] } });
      expect(r.status, JSON.stringify(change)).toBe(422);
    }
  });
});

describe('platform console', () => {
  it('creating a school returns a one-time temporary password and forces a change', async () => {
    const r = await call(tenants.POST, {
      cookie: await cookieFor(f.owner),
      body: { name: 'Hill School', prefix: 'HILL', admin: { displayName: 'Head', email: 'Head@Hill.test' } },
    });
    expect(r.status).toBe(201);
    expect(r.json.tenant.prefix).toBe('hill');
    expect(r.json.schoolAdmin.temporaryPassword).toMatch(/^\S{4}-\S{4}-\S{4}$/);
    const admin = await systemDb().user.findFirstOrThrow({ where: { email: 'head@hill.test' } });
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.passwordHash).not.toContain(r.json.schoolAdmin.temporaryPassword);
    const audit = await systemDb().auditLog.findFirstOrThrow({
      where: { action: 'tenant.create', entityId: r.json.tenant.id },
    });
    expect(JSON.stringify(audit)).not.toContain(r.json.schoolAdmin.temporaryPassword);
  });

  it('rejects duplicate prefixes and malformed prefixes', async () => {
    const cookie = await cookieFor(f.owner);
    const dup = await call(tenants.POST, {
      cookie,
      body: { name: 'Dup', prefix: 'sca', admin: { displayName: 'Xavier', email: 'x@dup.test' } },
    });
    expect(dup.status).toBe(409);
    const bad = await call(tenants.POST, {
      cookie,
      body: { name: 'Bad', prefix: 'b s', admin: { displayName: 'Xavier', email: 'x@bad.test' } },
    });
    expect(bad.status).toBe(422);
  });

  it('suspending a school signs everyone out immediately', async () => {
    const studentB = await cookieFor(f.b.STUDENT);
    const r = await call(tenantById.PATCH, {
      method: 'PATCH',
      cookie: await cookieFor(f.owner),
      params: { id: f.tenantB.id },
      body: { status: 'SUSPENDED' },
    });
    expect(r.status).toBe(200);
    expect(await systemDb().session.count({ where: { tenantId: f.tenantB.id } })).toBe(0);
    expect((await call(me.GET, { cookie: studentB })).status).toBe(401);
    await systemDb().tenant.update({ where: { id: f.tenantB.id }, data: { status: 'ACTIVE' } });
  });

  it('tenant list exposes metadata only', async () => {
    const r = await call(tenants.GET, { cookie: await cookieFor(f.owner) });
    const keys = Object.keys(r.json.items[0]).sort();
    expect(keys).toEqual(['city', 'createdAt', 'id', 'name', 'plan', 'prefix', 'status', 'suspendedAt', 'userCount']);
  });
});

describe('route coverage', () => {
  it('every API route is in the authorization matrix or explicitly public', () => {
    const root = path.resolve('src/app');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'route.ts') {
          const src = fs.readFileSync(p, 'utf8');
          const urlPath = '/' + path.relative(root, path.dirname(p)).split(path.sep).join('/');
          for (const m of src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g))
            found.push(`${m[1]} ${urlPath}`);
        }
      }
    };
    walk(path.join(root, 'api'));
    const covered = new Set([...MATRIX.map((r) => r.key), ...NOT_IN_MATRIX]);
    expect(found.filter((k) => !covered.has(k))).toEqual([]);
    expect(found.length).toBeGreaterThan(10);
  });
});
