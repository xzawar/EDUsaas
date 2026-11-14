import { Client } from 'pg';
import type { Portal, UserRole } from '@prisma/client';
import { systemDb } from '@/server/db/system';
import { hashPassword } from '@/server/auth/password';
import { normalizeUsername } from '@/server/auth/username';
import { createSession, SESSION_COOKIE } from '@/server/auth/session';
import { portalForRole } from '@/server/auth/portals';

export const PASSWORD = 'Test-pass-123';

export type FixtureUser = { id: string; role: UserRole; tenantId: string | null; login: string };
export type Fixtures = {
  tenantA: { id: string; prefix: string };
  tenantB: { id: string; prefix: string };
  a: Record<'SCHOOL_ADMIN' | 'PRINCIPAL' | 'ADMISSIONS_OFFICER' | 'ACCOUNTANT' | 'TEACHER' | 'STUDENT', FixtureUser>;
  b: Record<'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT', FixtureUser>;
  owner: FixtureUser;
  platformAdmin: FixtureUser;
  /** School structure (Phase 2). */
  s: Structure;
};

export type Structure = {
  yearA: string;
  yearA2: string;
  classA8: string;
  sectionA8A: string;
  sectionA8B: string;
  sectionA2_9A: string;
  subjMath: string;
  subjEng: string;
  teacherA: string;
  studentA: string;
  yearB: string;
  sectionB9B: string;
  subjB: string;
  teacherB: string;
  studentB: string;
};

let passwordHash: string | undefined;

/** Wipes every table (owner connection; TRUNCATE is not available to runtime roles). */
export async function resetDatabase() {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`);
  await client.end();
}

async function user(
  tenantId: string | null,
  role: UserRole,
  ident: { username?: string; email?: string },
): Promise<FixtureUser> {
  passwordHash ??= await hashPassword(PASSWORD);
  const u = await systemDb().user.create({
    data: {
      tenantId,
      role,
      displayName: `${role} ${ident.username ?? ident.email}`,
      username: ident.username ?? null,
      usernameNormalized: ident.username ? normalizeUsername(ident.username) : null,
      email: ident.email ?? null,
      passwordHash,
      mustChangePassword: false,
    },
  });
  return { id: u.id, role, tenantId, login: ident.username ?? ident.email! };
}

export async function seedFixtures(): Promise<Fixtures> {
  await resetDatabase();
  const db = systemDb();
  const tA = await db.tenant.create({
    data: { name: 'School A', prefix: 'sca', status: 'ACTIVE', settings: { create: {} } },
  });
  const tB = await db.tenant.create({
    data: { name: 'School B', prefix: 'scb', status: 'ACTIVE', settings: { create: {} } },
  });
  const f: Omit<Fixtures, 's'> = {
    tenantA: { id: tA.id, prefix: tA.prefix },
    tenantB: { id: tB.id, prefix: tB.prefix },
    a: {
      SCHOOL_ADMIN: await user(tA.id, 'SCHOOL_ADMIN', { email: 'admin@a.test' }),
      PRINCIPAL: await user(tA.id, 'PRINCIPAL', { email: 'principal@a.test' }),
      ADMISSIONS_OFFICER: await user(tA.id, 'ADMISSIONS_OFFICER', { email: 'admissions@a.test' }),
      ACCOUNTANT: await user(tA.id, 'ACCOUNTANT', { email: 'accounts@a.test' }),
      TEACHER: await user(tA.id, 'TEACHER', { username: 'sca-t-teacher-1' }),
      STUDENT: await user(tA.id, 'STUDENT', { username: 'sca-8a-student-1' }),
    },
    b: {
      SCHOOL_ADMIN: await user(tB.id, 'SCHOOL_ADMIN', { email: 'admin@b.test' }),
      TEACHER: await user(tB.id, 'TEACHER', { username: 'scb-t-teacher-1' }),
      STUDENT: await user(tB.id, 'STUDENT', { username: 'scb-9b-student-1' }),
    },
    owner: await user(null, 'PLATFORM_OWNER', { email: 'owner@platform.test' }),
    platformAdmin: await user(null, 'PLATFORM_ADMIN', { email: 'ops@platform.test' }),
  };
  return { ...f, s: await seedStructure(f) };
}

/**
 * School A: 2026-27 (current) with class 8 (sections A, B), subjects Mathematics + English; the fixture teacher
 * teaches 8-A Mathematics and is 8-A's Class Incharge; the fixture student is 8-A roll 1. Plus 2027-28 (planned)
 * with class 9-A as a promotion target. School B: class 9-B with its own teacher and student.
 */
async function seedStructure(f: Omit<Fixtures, 's'>): Promise<Structure> {
  const db = systemDb();
  const A = f.tenantA.id;
  const B = f.tenantB.id;
  const yearA = await db.academicYear.create({
    data: {
      tenantId: A,
      name: '2026-27',
      startsOn: new Date('2026-04-01'),
      endsOn: new Date('2027-03-31'),
      status: 'CURRENT',
    },
  });
  const yearA2 = await db.academicYear.create({
    data: {
      tenantId: A,
      name: '2027-28',
      startsOn: new Date('2027-04-01'),
      endsOn: new Date('2028-03-31'),
      status: 'PLANNED',
    },
  });
  const subjMath = await db.subject.create({ data: { tenantId: A, name: 'Mathematics' } });
  const subjEng = await db.subject.create({ data: { tenantId: A, name: 'English' } });
  const classA8 = await db.class.create({
    data: {
      tenantId: A,
      academicYearId: yearA.id,
      name: '8',
      gradeLevel: 8,
      subjects: {
        create: [
          { tenantId: A, subjectId: subjMath.id },
          { tenantId: A, subjectId: subjEng.id },
        ],
      },
    },
  });
  const teacherA = await db.teacher.create({ data: { tenantId: A, userId: f.a.TEACHER.id } });
  const sectionA8A = await db.section.create({
    data: { tenantId: A, classId: classA8.id, name: 'A', capacity: 30, classTeacherId: teacherA.id, nextRollNumber: 2 },
  });
  const sectionA8B = await db.section.create({ data: { tenantId: A, classId: classA8.id, name: 'B', capacity: 30 } });
  const class9 = await db.class.create({ data: { tenantId: A, academicYearId: yearA2.id, name: '9', gradeLevel: 9 } });
  const sectionA2_9A = await db.section.create({ data: { tenantId: A, classId: class9.id, name: 'A' } });
  await db.teacherAssignment.create({
    data: { tenantId: A, teacherId: teacherA.id, sectionId: sectionA8A.id, subjectId: subjMath.id },
  });
  const studentA = await db.student.create({
    data: {
      tenantId: A,
      userId: f.a.STUDENT.id,
      sectionId: sectionA8A.id,
      rollNumber: 1,
      guardianName: 'Guardian A',
      guardianPhone: '03001111111',
    },
  });

  const yearB = await db.academicYear.create({
    data: {
      tenantId: B,
      name: '2026-27',
      startsOn: new Date('2026-04-01'),
      endsOn: new Date('2027-03-31'),
      status: 'CURRENT',
    },
  });
  const subjB = await db.subject.create({ data: { tenantId: B, name: 'Mathematics' } });
  const classB9 = await db.class.create({ data: { tenantId: B, academicYearId: yearB.id, name: '9', gradeLevel: 9 } });
  const teacherB = await db.teacher.create({ data: { tenantId: B, userId: f.b.TEACHER.id } });
  const sectionB9B = await db.section.create({
    data: { tenantId: B, classId: classB9.id, name: 'B', classTeacherId: teacherB.id, nextRollNumber: 2 },
  });
  const studentB = await db.student.create({
    data: { tenantId: B, userId: f.b.STUDENT.id, sectionId: sectionB9B.id, rollNumber: 1 },
  });

  return {
    yearA: yearA.id,
    yearA2: yearA2.id,
    classA8: classA8.id,
    sectionA8A: sectionA8A.id,
    sectionA8B: sectionA8B.id,
    sectionA2_9A: sectionA2_9A.id,
    subjMath: subjMath.id,
    subjEng: subjEng.id,
    teacherA: teacherA.id,
    studentA: studentA.id,
    yearB: yearB.id,
    sectionB9B: sectionB9B.id,
    subjB: subjB.id,
    teacherB: teacherB.id,
    studentB: studentB.id,
  };
}

/** A signed-in cookie for a fixture user (portal defaults to the role's own portal). */
export async function cookieFor(u: FixtureUser, portal?: Portal): Promise<string> {
  const { token } = await createSession({
    userId: u.id,
    tenantId: u.tenantId,
    portal: portal ?? portalForRole(u.role),
  });
  return `${SESSION_COOKIE}=${token}`;
}
