/**
 * Development/demo seed. Creates the platform accounts and two schools:
 *  - Bright Star School (bss): a realistic school — current year 2026-27 with Prep + classes 1–10, 21 sections,
 *    11 subjects, 22 teachers with assignments and Class Incharges, ~420 students with guardians — plus an empty
 *    2027-28 year to try "Copy structure" and Promotion.
 *  - Green Valley School (gvs): a small second tenant, so cross-tenant isolation can be demonstrated.
 * Idempotent: structure is only created once; demo account passwords are reset on every run.
 * Uses the system role (BYPASSRLS) because it writes across tenants. Credentials are for development/demo only.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { Prisma, PrismaClient, type Gender, type UserRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { normalizeUsername, studentUsername, teacherUsername } from '../src/server/auth/username';

const db = new PrismaClient({ datasourceUrl: process.env.SYSTEM_DATABASE_URL });
const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const DEMO_PASSWORD = 'Demo-pass-2026';

// Deterministic PRNG so every environment gets the same demo school.
function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(20260404);
const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const BOYS = [
  'Ahmad',
  'Ali',
  'Hamza',
  'Usman',
  'Bilal',
  'Hassan',
  'Hussain',
  'Zain',
  'Saad',
  'Taha',
  'Umar',
  'Fahad',
  'Danish',
  'Faizan',
  'Haris',
  'Ibrahim',
  'Junaid',
  'Kashif',
  'Moiz',
  'Rayyan',
  'Shayan',
  'Talha',
  'Waleed',
  'Yahya',
  'Zohaib',
  'Arham',
  'Abdullah',
  'Ayaan',
  'Muneeb',
  'Sami',
];
const GIRLS = [
  'Ayesha',
  'Fatima',
  'Zainab',
  'Maryam',
  'Hira',
  'Sana',
  'Iqra',
  'Amna',
  'Hafsa',
  'Khadija',
  'Mahnoor',
  'Noor',
  'Rida',
  'Sara',
  'Areeba',
  'Eman',
  'Laiba',
  'Minahil',
  'Anaya',
  'Dua',
  'Esha',
  'Hania',
  'Inaya',
  'Javeria',
  'Kinza',
  'Mehwish',
  'Nimra',
  'Rabia',
  'Sidra',
  'Zara',
];
const SURNAMES = [
  'Khan',
  'Ahmed',
  'Raza',
  'Malik',
  'Butt',
  'Qureshi',
  'Siddiqui',
  'Chaudhry',
  'Sheikh',
  'Iqbal',
  'Hussain',
  'Mirza',
  'Rana',
  'Javed',
  'Aslam',
  'Farooq',
  'Hashmi',
  'Abbasi',
  'Bhatti',
  'Nawaz',
  'Shah',
  'Akhtar',
  'Anwar',
  'Saleem',
];
const FATHERS = [
  'Muhammad',
  'Abdul',
  'Tariq',
  'Imran',
  'Asif',
  'Khalid',
  'Nadeem',
  'Shahid',
  'Waqar',
  'Zahid',
  'Sohail',
  'Kamran',
  'Faisal',
  'Naveed',
  'Rashid',
  'Adnan',
];
const AREAS = [
  'Model Town',
  'Gulberg',
  'Johar Town',
  'DHA Phase 5',
  'Garden Town',
  'Faisal Town',
  'Wapda Town',
  'Iqbal Town',
  'Township',
  'Cantt',
];

type SeedUser = { role: UserRole; displayName: string; username?: string; email?: string };

const PLATFORM_USERS: SeedUser[] = [
  { role: 'PLATFORM_OWNER', displayName: 'Platform Owner', email: 'owner@edusaas.test' },
  { role: 'PLATFORM_ADMIN', displayName: 'Platform Admin', email: 'ops@edusaas.test' },
];

let passwordHash = '';

async function upsertUser(u: SeedUser, tenantId: string | null) {
  const data = {
    tenantId,
    role: u.role,
    displayName: u.displayName,
    username: u.username ?? null,
    usernameNormalized: u.username ? normalizeUsername(u.username) : null,
    email: u.email ?? null,
    passwordHash,
    mustChangePassword: false,
    status: 'ACTIVE' as const,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  const existing = await db.user.findFirst({
    where: u.email ? { email: u.email } : { usernameNormalized: normalizeUsername(u.username!) },
  });
  return existing ? db.user.update({ where: { id: existing.id }, data }) : db.user.create({ data });
}

async function ensureTenant(name: string, prefix: string, city: string) {
  return db.tenant.upsert({
    where: { prefix },
    create: { name, prefix, city, status: 'ACTIVE', settings: { create: {} } },
    update: { name, city, status: 'ACTIVE', suspendedAt: null },
  });
}

const DEFAULT_BANDS = [
  { grade: 'A1', min: 90 },
  { grade: 'A', min: 80 },
  { grade: 'B', min: 70 },
  { grade: 'C', min: 60 },
  { grade: 'D', min: 50 },
  { grade: 'E', min: 40 },
  { grade: 'F', min: 0 },
];

async function ensureYear(
  tenantId: string,
  name: string,
  startsOn: string,
  endsOn: string,
  status: 'CURRENT' | 'PLANNED',
) {
  const existing = await db.academicYear.findUnique({ where: { tenantId_name: { tenantId, name } } });
  if (existing) return existing;
  const year = await db.academicYear.create({
    data: { tenantId, name, startsOn: new Date(startsOn), endsOn: new Date(endsOn), status },
  });
  await db.gradingScheme.create({ data: { tenantId, academicYearId: year.id, version: 1, bands: DEFAULT_BANDS } });
  return year;
}

// ── Bright Star School ──────────────────────────────────────────────────────

const SUBJECTS = [
  'English',
  'Urdu',
  'Mathematics',
  'General Science',
  'Social Studies',
  'Islamiyat',
  'Computer Science',
  'Physics',
  'Chemistry',
  'Biology',
  'Art',
];
const CODES: Record<string, string> = {
  English: 'ENG',
  Urdu: 'URD',
  Mathematics: 'MATH',
  'General Science': 'SCI',
  'Social Studies': 'SST',
  Islamiyat: 'ISL',
  'Computer Science': 'CS',
  Physics: 'PHY',
  Chemistry: 'CHEM',
  Biology: 'BIO',
  Art: 'ART',
};

function subjectsFor(grade: number): string[] {
  if (grade <= 0) return ['English', 'Urdu', 'Mathematics', 'Art'];
  if (grade <= 5)
    return ['English', 'Urdu', 'Mathematics', 'General Science', 'Social Studies', 'Islamiyat', 'Computer Science'];
  if (grade <= 8)
    return ['English', 'Urdu', 'Mathematics', 'General Science', 'Social Studies', 'Islamiyat', 'Computer Science'];
  return ['English', 'Urdu', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Islamiyat', 'Computer Science'];
}

// Teacher → subjects they teach. Ali Khan keeps the existing demo login (bss-t-alikhan-1) and is 8-A's incharge.
const TEACHERS: { name: string; subjects: string[]; qualification: string }[] = [
  { name: 'Ali Khan', subjects: ['Mathematics'], qualification: 'M.Sc Mathematics' },
  { name: 'Saima Akhtar', subjects: ['English'], qualification: 'M.A English' },
  { name: 'Farhan Siddiqui', subjects: ['Physics', 'General Science'], qualification: 'M.Sc Physics' },
  { name: 'Nazia Parveen', subjects: ['Urdu'], qualification: 'M.A Urdu' },
  { name: 'Kamran Haider', subjects: ['Computer Science'], qualification: 'BS Computer Science' },
  { name: 'Rubina Kausar', subjects: ['Islamiyat'], qualification: 'M.A Islamic Studies' },
  { name: 'Tahir Mehmood', subjects: ['Chemistry', 'General Science'], qualification: 'M.Sc Chemistry' },
  { name: 'Shazia Naz', subjects: ['Biology', 'General Science'], qualification: 'M.Sc Zoology' },
  { name: 'Waseem Abbas', subjects: ['Social Studies'], qualification: 'M.A History' },
  { name: 'Uzma Rafiq', subjects: ['Mathematics'], qualification: 'M.Sc Mathematics' },
  { name: 'Nadia Hameed', subjects: ['English'], qualification: 'M.A English' },
  { name: 'Bushra Iqbal', subjects: ['Art', 'English'], qualification: 'B.Ed' },
  { name: 'Imtiaz Ahmed', subjects: ['Urdu', 'Islamiyat'], qualification: 'M.A Urdu' },
  { name: 'Sadia Noreen', subjects: ['Mathematics', 'Computer Science'], qualification: 'BS Mathematics' },
  { name: 'Asma Jabeen', subjects: ['General Science', 'Social Studies'], qualification: 'B.Sc, B.Ed' },
  { name: 'Faisal Rehman', subjects: ['English', 'Social Studies'], qualification: 'M.A English' },
  { name: 'Mehreen Fatima', subjects: ['Urdu', 'Art'], qualification: 'M.A Urdu' },
  { name: 'Zeeshan Ali', subjects: ['Physics', 'Mathematics'], qualification: 'M.Phil Physics' },
  { name: 'Hina Batool', subjects: ['Islamiyat', 'Social Studies'], qualification: 'M.A Islamiat' },
  { name: 'Adeel Aslam', subjects: ['Computer Science', 'Mathematics'], qualification: 'BS Software Engineering' },
  { name: 'Samina Yousaf', subjects: ['English', 'Urdu'], qualification: 'B.Ed' },
  { name: 'Rizwan Qadir', subjects: ['Chemistry', 'Biology'], qualification: 'M.Sc Chemistry' },
];

async function seedBrightStar() {
  const tenant = await ensureTenant('Bright Star School', 'bss', 'Lahore');
  const t = tenant.id;
  for (const u of [
    { role: 'SCHOOL_ADMIN', displayName: 'Sara Ahmed', email: 'admin@bss.test' },
    { role: 'PRINCIPAL', displayName: 'Imran Qureshi', email: 'principal@bss.test' },
    { role: 'ADMISSIONS_OFFICER', displayName: 'Nadia Malik', email: 'admissions@bss.test' },
  ] satisfies SeedUser[])
    await upsertUser(u, t);

  const year = await ensureYear(t, '2026-27', '2026-04-01', '2027-03-31', 'CURRENT');
  await ensureYear(t, '2027-28', '2027-04-01', '2028-03-31', 'PLANNED');

  // Demo student logins must always exist with the demo password.
  const demoStudents = [
    { name: 'Ahmad Raza', username: 'bss-8a-ahmad-14', roll: 14, gender: 'MALE' as Gender },
    { name: 'Ayesha Noor', username: 'bss-8a-ayesha-15', roll: 15, gender: 'FEMALE' as Gender },
  ];

  if ((await db.class.count({ where: { academicYearId: year.id } })) > 0) {
    for (const s of demoStudents) await upsertUser({ role: 'STUDENT', displayName: s.name, username: s.username }, t);
    for (const tch of TEACHERS)
      await upsertUser(
        {
          role: 'TEACHER',
          displayName: tch.name,
          username: teacherUsername({ prefix: 'bss', displayName: tch.name, sequence: 1 }),
        },
        t,
      );
    console.log('Bright Star School already has structure; demo passwords refreshed.');
    return;
  }

  // Subjects
  const subjectId = new Map<string, string>();
  for (const name of SUBJECTS) {
    const s = await db.subject.upsert({
      where: { tenantId_name: { tenantId: t, name } },
      create: { tenantId: t, name, code: CODES[name] },
      update: {},
    });
    subjectId.set(name, s.id);
  }

  // Teachers
  const teachers: { id: string; name: string; subjects: string[] }[] = [];
  for (const [i, tch] of TEACHERS.entries()) {
    const user = await upsertUser(
      {
        role: 'TEACHER',
        displayName: tch.name,
        username: teacherUsername({ prefix: 'bss', displayName: tch.name, sequence: 1 }),
      },
      t,
    );
    const teacher = await db.teacher.upsert({
      where: { userId: user.id },
      create: {
        tenantId: t,
        userId: user.id,
        employeeNo: `BSS-T-${String(i + 1).padStart(3, '0')}`,
        phone: `0300${String(1000000 + i * 7919).slice(0, 7)}`,
        qualification: tch.qualification,
        joinedOn: new Date(`${2015 + (i % 9)}-0${1 + (i % 9)}-15`),
      },
      update: {},
    });
    teachers.push({ id: teacher.id, name: tch.name, subjects: tch.subjects });
  }

  // Classes & sections
  const layout: { name: string; grade: number; sections: string[] }[] = [
    { name: 'Prep', grade: 0, sections: ['A'] },
    ...Array.from({ length: 10 }, (_, i) => ({ name: String(i + 1), grade: i + 1, sections: ['A', 'B'] })),
  ];
  const load = new Map<string, number>(teachers.map((x) => [x.id, 0]));
  let inchargeIdx = 0;
  let admissionSeq = 1;
  const usersBatch: Prisma.UserCreateManyInput[] = [];
  const studentsBatch: Prisma.StudentCreateManyInput[] = [];

  for (const c of layout) {
    const subjects = subjectsFor(c.grade);
    const cls = await db.class.create({
      data: {
        tenantId: t,
        academicYearId: year.id,
        name: c.name,
        gradeLevel: c.grade,
        subjects: { create: subjects.map((s) => ({ tenantId: t, subjectId: subjectId.get(s)! })) },
      },
    });
    for (const secName of c.sections) {
      const label = `${c.name}-${secName}`;
      // Class Incharge: Ali Khan for 8-A; others round-robin; 10-B is deliberately left without one.
      let classTeacherId: string | null = null;
      if (label === '8-A') classTeacherId = teachers[0]!.id;
      else if (label !== '10-B') {
        inchargeIdx = (inchargeIdx % (teachers.length - 1)) + 1;
        classTeacherId = teachers[inchargeIdx]!.id;
      }
      const size = c.grade === 0 ? 16 : between(18, 23);
      const section = await db.section.create({
        data: {
          tenantId: t,
          classId: cls.id,
          name: secName,
          capacity: c.grade === 0 ? 20 : 25,
          classTeacherId,
          nextRollNumber: size + 1,
        },
      });

      // Teacher assignments: least-loaded teacher who teaches the subject (Ali Khan always takes 8-A maths).
      for (const subj of subjects) {
        const candidates = teachers.filter((x) => x.subjects.includes(subj));
        const chosen =
          label === '8-A' && subj === 'Mathematics'
            ? teachers[0]!
            : candidates.sort((a, b) => load.get(a.id)! - load.get(b.id)!)[0]!;
        load.set(chosen.id, load.get(chosen.id)! + 1);
        await db.teacherAssignment.create({
          data: { tenantId: t, teacherId: chosen.id, sectionId: section.id, subjectId: subjectId.get(subj)! },
        });
      }

      // Students
      for (let roll = 1; roll <= size; roll++) {
        const demo = label === '8-A' ? demoStudents.find((d) => d.roll === roll) : undefined;
        const gender: Gender = demo?.gender ?? (rand() < 0.5 ? 'FEMALE' : 'MALE');
        const first = demo ? demo.name.split(' ')[0]! : gender === 'FEMALE' ? pick(GIRLS) : pick(BOYS);
        const surname = demo ? demo.name.split(' ')[1]! : pick(SURNAMES);
        const name = `${first} ${surname}`;
        const username =
          demo?.username ??
          studentUsername({
            prefix: 'bss',
            className: c.name,
            sectionName: secName,
            displayName: name,
            rollNumber: roll,
          });
        const userId = crypto.randomUUID();
        const ageYears = 5 + Math.max(c.grade, 0);
        usersBatch.push({
          id: userId,
          tenantId: t,
          role: 'STUDENT',
          displayName: name,
          username,
          usernameNormalized: normalizeUsername(username),
          passwordHash,
          mustChangePassword: false,
        });
        studentsBatch.push({
          tenantId: t,
          userId,
          sectionId: section.id,
          rollNumber: roll,
          admissionNo: `BSS-${2016 + Math.min(c.grade, 9) - (c.grade > 0 ? 0 : 0)}-${String(admissionSeq++).padStart(4, '0')}`,
          gender,
          dateOfBirth: new Date(
            `${2026 - ageYears}-${String(between(1, 12)).padStart(2, '0')}-${String(between(1, 28)).padStart(2, '0')}`,
          ),
          guardianName: `${pick(FATHERS)} ${surname}`,
          guardianPhone: `03${between(0, 4)}${between(0, 9)}${between(1000000, 9999999)}`,
          address: `House ${between(1, 400)}, ${pick(AREAS)}, Lahore`,
          admittedOn: new Date(`${2026 - Math.max(c.grade, 0)}-04-0${between(1, 9)}`),
        });
      }
    }
  }

  // The two pre-existing demo student users are replaced by the batch versions (same usernames).
  await db.user.deleteMany({
    where: {
      tenantId: t,
      role: 'STUDENT',
      usernameNormalized: { in: demoStudents.map((d) => normalizeUsername(d.username)) },
    },
  });
  for (let i = 0; i < usersBatch.length; i += 200) await db.user.createMany({ data: usersBatch.slice(i, i + 200) });
  for (let i = 0; i < studentsBatch.length; i += 200)
    await db.student.createMany({ data: studentsBatch.slice(i, i + 200) });
  console.log(
    `Bright Star School: ${layout.length} classes, ${studentsBatch.length} students, ${teachers.length} teachers.`,
  );
}

// ── Green Valley School (small second tenant) ───────────────────────────────

async function seedGreenValley() {
  const tenant = await ensureTenant('Green Valley School', 'gvs', 'Islamabad');
  const t = tenant.id;
  await upsertUser({ role: 'SCHOOL_ADMIN', displayName: 'Omar Farooq', email: 'admin@gvs.test' }, t);
  const hina = await upsertUser({ role: 'TEACHER', displayName: 'Hina Shah', username: 'gvs-t-hinashah-1' }, t);
  const year = await ensureYear(t, '2026-27', '2026-04-01', '2027-03-31', 'CURRENT');
  if ((await db.class.count({ where: { academicYearId: year.id } })) > 0) {
    await upsertUser({ role: 'STUDENT', displayName: 'Bilal Hussain', username: 'gvs-9b-bilal-3' }, t);
    return;
  }
  const subjects = await Promise.all(
    ['English', 'Mathematics', 'Physics'].map((name) =>
      db.subject.upsert({ where: { tenantId_name: { tenantId: t, name } }, create: { tenantId: t, name }, update: {} }),
    ),
  );
  const teacher = await db.teacher.upsert({
    where: { userId: hina.id },
    create: { tenantId: t, userId: hina.id, employeeNo: 'GVS-T-001' },
    update: {},
  });
  const cls = await db.class.create({
    data: {
      tenantId: t,
      academicYearId: year.id,
      name: '9',
      gradeLevel: 9,
      subjects: { create: subjects.map((s) => ({ tenantId: t, subjectId: s.id })) },
    },
  });
  const section = await db.section.create({
    data: { tenantId: t, classId: cls.id, name: 'B', capacity: 30, classTeacherId: teacher.id, nextRollNumber: 7 },
  });
  await db.teacherAssignment.createMany({
    data: subjects.map((s) => ({ tenantId: t, teacherId: teacher.id, sectionId: section.id, subjectId: s.id })),
  });
  await db.user.deleteMany({ where: { tenantId: t, role: 'STUDENT' } });
  const names = ['Hamza Iqbal', 'Laiba Shah', 'Bilal Hussain', 'Eman Abbasi', 'Saad Nawaz', 'Kinza Mirza'];
  for (const [i, name] of names.entries()) {
    const roll = i + 1;
    const username = studentUsername({
      prefix: 'gvs',
      className: '9',
      sectionName: 'B',
      displayName: name,
      rollNumber: roll,
    });
    const user = await db.user.create({
      data: {
        tenantId: t,
        role: 'STUDENT',
        displayName: name,
        username,
        usernameNormalized: normalizeUsername(username),
        passwordHash,
        mustChangePassword: false,
      },
    });
    await db.student.create({
      data: {
        tenantId: t,
        userId: user.id,
        sectionId: section.id,
        rollNumber: roll,
        admissionNo: `GVS-${String(roll).padStart(4, '0')}`,
        guardianName: `Mr. ${name.split(' ')[1]}`,
        guardianPhone: `0333555${String(1000 + roll)}`,
      },
    });
  }
  console.log('Green Valley School: 1 class, 6 students.');
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demo accounts in production (set DEMO_SEED=true for a demo deployment)');
  }
  passwordHash = await hash(DEMO_PASSWORD, ARGON2);
  for (const u of PLATFORM_USERS) await upsertUser(u, null);
  await seedBrightStar();
  await seedGreenValley();
  console.log(`Seed complete. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
