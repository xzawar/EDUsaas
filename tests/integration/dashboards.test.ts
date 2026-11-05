import { beforeEach, describe, expect, it } from 'vitest';
import { resolveSession } from '@/server/auth/session';
import { loadPermissions } from '@/server/authz/context';
import { systemDb } from '@/server/db/system';
import type { AuthedContext } from '@/server/http/route';
import { platformOverview } from '@/server/platform/overview';
import { attendanceOverview } from '@/server/school/attendance';
import { admissionsOverview, subjectAverages } from '@/server/school/dashboard';
import { cookieFor, seedFixtures, type FixtureUser, type Fixtures } from './helpers/fixtures';

/** Role dashboards: the numbers each role sees come from their own school only, and are right. */

let f: Fixtures;
beforeEach(async () => {
  f = await seedFixtures();
});

async function ctxFor(u: FixtureUser): Promise<AuthedContext> {
  const token = (await cookieFor(u)).split('=')[1]!;
  const session = (await resolveSession(token))!;
  const permissions = await loadPermissions(session.user);
  return {
    requestId: 'test',
    ipHash: null,
    userAgent: null,
    session,
    user: session.user,
    tenantId: session.user.tenantId,
    permissions,
    can: (p) => permissions.has(p),
  } as AuthedContext;
}

describe('admissions desk', () => {
  it('counts seats per section of the current year, for this school only', async () => {
    const a = await admissionsOverview(await ctxFor(f.a.ADMISSIONS_OFFICER));
    expect(a.year?.name).toBe('2026-27');
    expect(a.seats.map((s) => s.label)).toEqual(['8-A', '8-B']); // 9-A is next year's; School B's are hidden
    expect(a.seats[0]).toMatchObject({ students: 1, capacity: 30, left: 29 });
    expect(a.seatsLeft).toBe(59);
    expect(a.full).toBe(0);
    expect(a.admitted).toBe(1); // the fixture student was admitted today
    expect(a.unplaced).toBe(0);
  });

  it('shows a full section and this month’s withdrawals', async () => {
    const db = systemDb();
    await db.section.update({ where: { id: f.s.sectionA8A }, data: { capacity: 1 } });
    await db.student.create({
      data: {
        tenantId: f.tenantA.id,
        userId: (
          await db.user.create({
            data: {
              tenantId: f.tenantA.id,
              role: 'STUDENT',
              displayName: 'Left Early',
              username: `sca-left-${Date.now()}`,
              passwordHash: 'x',
              usernameNormalized: `scaleft${Date.now()}`,
            },
          })
        ).id,
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
      },
    });
    const a = await admissionsOverview(await ctxFor(f.a.ADMISSIONS_OFFICER));
    expect(a.full).toBe(1);
    expect(a.seats[0]!.left).toBe(0);
    expect(a.withdrawn).toBe(1);
  });
});

describe('principal: results by subject', () => {
  it('averages published tests only, as a percentage of the total', async () => {
    const db = systemDb();
    const scheme = await db.gradingScheme.create({
      data: { tenantId: f.tenantA.id, academicYearId: f.s.yearA, bands: [{ min: 0, grade: 'F' }] },
    });
    const base = {
      tenantId: f.tenantA.id,
      academicYearId: f.s.yearA,
      sectionId: f.s.sectionA8A,
      subjectId: f.s.subjMath,
      gradingSchemeId: scheme.id,
      maxMarks: 20,
      heldOn: new Date('2026-10-01'),
      createdBy: f.a.TEACHER.id,
    };
    const published = await db.assessment.create({ data: { ...base, name: 'Quiz 1', status: 'PUBLISHED' } });
    const draft = await db.assessment.create({ data: { ...base, name: 'Quiz 2', status: 'DRAFT' } });
    await db.mark.createMany({
      data: [
        { tenantId: f.tenantA.id, assessmentId: published.id, studentId: f.s.studentA, score: 15 },
        { tenantId: f.tenantA.id, assessmentId: draft.id, studentId: f.s.studentA, score: 2 },
      ],
    });
    const rows = await subjectAverages(await ctxFor(f.a.PRINCIPAL));
    expect(rows).toEqual([{ subject: 'Mathematics', avg: 75, tests: 1 }]);
    // School B sees nothing of it.
    expect(await subjectAverages(await ctxFor(f.b.SCHOOL_ADMIN))).toEqual([]);
  });
});

describe('principal: attendance today by class', () => {
  it('is empty before any register is taken', async () => {
    const att = await attendanceOverview(await ctxFor(f.a.PRINCIPAL));
    expect(att?.todayByClass).toEqual([]);
  });
});

describe('platform owner overview', () => {
  it('adds up revenue from paying schools and flags schools without a plan or near their limit', async () => {
    const db = systemDb();
    const plan = await db.plan.create({
      data: { name: `Tiny ${Date.now()}`, priceMonthly: 5000, maxStudents: 1, maxStaff: 50 },
    });
    await db.subscription.create({ data: { tenantId: f.tenantA.id, planId: plan.id, status: 'ACTIVE' } });
    const o = await platformOverview();
    expect(o.monthlyRevenue).toBe(5000);
    expect(o.subscriptions.active).toBe(1);
    expect(o.nearLimit.map((s) => s.name)).toContain('School A'); // 1 of 1 students
    expect(o.withoutPlan.map((s) => s.name)).toContain('School B');
    expect(o.withoutPlan.map((s) => s.name)).not.toContain('School A');
  });
});
