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
    { role: 'ACCOUNTANT', displayName: 'Bilal Hassan', email: 'accounts@bss.test' },
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

// ── Phase 3 demo history: timetable, attendance, check-ins, tests & marks, leave, remarks ─────────────

function dayInKarachi(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}
function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isSchoolDay = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() !== 0; // Mon–Sat
async function chunked<T>(rows: T[], size: number, fn: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

// ── Phase 6 demo: plans, subscriptions, Platform Admin access, a support ticket ──
async function seedPlatform() {
  const plans = [
    { name: 'Starter', priceMonthly: 15000, maxStudents: 300, maxStaff: 30 },
    { name: 'School', priceMonthly: 45000, maxStudents: 1500, maxStaff: 120 },
    { name: 'Campus', priceMonthly: 90000, maxStudents: null, maxStaff: null },
  ];
  for (const p of plans) await db.plan.upsert({ where: { name: p.name }, create: p, update: {} });
  const byName = new Map((await db.plan.findMany()).map((p) => [p.name, p.id]));
  for (const [prefix, plan, status] of [
    ['bss', 'School', 'ACTIVE'],
    ['gvs', 'Starter', 'TRIAL'],
  ] as const) {
    const t = await db.tenant.findUnique({ where: { prefix } });
    if (t && !(await db.subscription.findUnique({ where: { tenantId: t.id } })))
      await db.subscription.create({ data: { tenantId: t.id, planId: byName.get(plan)!, status } });
  }
  const owner = await db.user.findFirst({ where: { role: 'PLATFORM_OWNER' } });
  const ops = await db.user.findFirst({ where: { role: 'PLATFORM_ADMIN', email: 'ops@edusaas.test' } });
  if (owner && ops && !(await db.platformPermissionGrant.count({ where: { userId: ops.id } })))
    await db.platformPermissionGrant.createMany({
      data: ['platform.tenants.read', 'platform.support.queue', 'platform.support.access'].map((permission) => ({
        userId: ops.id,
        permission,
        grantedBy: owner.id,
      })),
    });
  const bss = await db.tenant.findUnique({ where: { prefix: 'bss' } });
  const admin = bss && (await db.user.findFirst({ where: { tenantId: bss.id, role: 'SCHOOL_ADMIN' } }));
  if (bss && admin && !(await db.supportTicket.count({ where: { tenantId: bss.id } }))) {
    const t = await db.supportTicket.create({
      data: {
        tenantId: bss.id,
        createdBy: admin.id,
        subject: 'How do we print login slips for a whole class?',
        status: 'ANSWERED',
      },
    });
    await db.ticketMessage.createMany({
      data: [
        {
          tenantId: bss.id,
          ticketId: t.id,
          authorId: admin.id,
          authorName: admin.displayName,
          body: 'We imported class 7-B. Can we print all their login slips at once?',
        },
        {
          tenantId: bss.id,
          ticketId: t.id,
          authorId: (ops ?? owner)!.id,
          authorName: `${(ops ?? owner)!.displayName} (EDUsaas)`,
          fromPlatform: true,
          body: 'Yes — after an import, press “Print slips” on the results screen. For students added earlier, reset their password from the student page to print a new slip.',
        },
      ],
    });
  }
}

// ── Phase 4 demo: a few announcements ───────────────────────────────────────
async function seedAnnouncements(prefix: string) {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { prefix } });
  if (await db.announcement.count({ where: { tenantId: tenant.id } })) return;
  const admin = await db.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: 'SCHOOL_ADMIN' } });
  const section = await db.section.findFirst({
    where: { tenantId: tenant.id, class: { academicYear: { status: 'CURRENT' } } },
    orderBy: [{ class: { gradeLevel: 'desc' } }, { name: 'asc' }],
    include: { class: true },
  });
  const items = [
    {
      title: 'Winter uniform from Monday',
      body: 'Please wear the winter uniform (navy sweater) from Monday 16 November.',
      audience: 'EVERYONE' as const,
      pinned: true,
    },
    {
      title: 'Staff meeting on Friday',
      body: 'All teachers: short meeting in the staff room on Friday at 1:30 pm about mid-term papers.',
      audience: 'STAFF' as const,
      pinned: false,
    },
    ...(section
      ? [
          {
            title: `Class ${section.class.name}-${section.name}: science fair`,
            body: 'Bring your project proposal to your Class Incharge by next Wednesday.',
            audience: 'SECTION' as const,
            pinned: false,
            sectionId: section.id,
          },
        ]
      : []),
  ];
  for (const a of items) await db.announcement.create({ data: { tenantId: tenant.id, createdBy: admin.id, ...a } });
}

async function seedOperations(prefix: string) {
  const tenant = await db.tenant.findUnique({ where: { prefix } });
  if (!tenant) return;
  const t = tenant.id;
  const year = await db.academicYear.findFirst({ where: { tenantId: t, status: 'CURRENT' } });
  if (!year) return;
  if ((await db.attendanceBatch.count({ where: { tenantId: t } })) > 0) {
    console.log(`${tenant.name}: operations history already present.`);
    return;
  }
  const today = dayInKarachi();
  const sections = await db.section.findMany({
    where: { tenantId: t, class: { academicYearId: year.id } },
    include: {
      class: { include: { subjects: true } },
      students: { where: { status: 'ACTIVE' }, include: { user: true }, orderBy: { rollNumber: 'asc' } },
      assignments: true,
    },
  });
  const teachers = await db.teacher.findMany({ where: { tenantId: t }, include: { user: true } });
  const admin = await db.user.findFirstOrThrow({ where: { tenantId: t, role: 'SCHOOL_ADMIN' } });

  // Timetable: default Mon–Sat, 8 periods + break; fill each section round-robin from its subjects without teacher clashes.
  const periods: { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean }[] = [];
  let m = 8 * 60;
  const hhmm = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  for (let p = 1; p <= 9; p++) {
    const len = p === 5 ? 20 : 40;
    periods.push({ periodNo: p, startsAt: hhmm(m), endsAt: hhmm(m + len), isBreak: p === 5 });
    m += len;
  }
  await db.timetableSlot.createMany({
    data: [1, 2, 3, 4, 5, 6].flatMap((d) => periods.map((p) => ({ ...p, dayOfWeek: d, tenantId: t }))),
    skipDuplicates: true,
  });
  const slots = await db.timetableSlot.findMany({ where: { tenantId: t } });
  const busy = new Set<string>();
  const entries: Prisma.TimetableEntryCreateManyInput[] = [];
  for (const [si, s] of sections.entries()) {
    const subs = s.class.subjects.map((x) => x.subjectId);
    if (!subs.length) continue;
    let k = si;
    let day = 0;
    for (const slot of slots
      .filter((x) => !x.isBreak)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodNo - b.periodNo)) {
      // Shift the rotation each day so a subject isn't in the same period all week.
      if (slot.dayOfWeek !== day) {
        day = slot.dayOfWeek;
        k += 1;
      }
      for (let tries = 0; tries < subs.length; tries++) {
        const subjectId = subs[(k + tries) % subs.length]!;
        const teacherId = s.assignments.find((a) => a.subjectId === subjectId)?.teacherId ?? null;
        if (teacherId && busy.has(`${teacherId}:${slot.id}`)) continue;
        if (teacherId) busy.add(`${teacherId}:${slot.id}`);
        entries.push({ tenantId: t, sectionId: s.id, slotId: slot.id, subjectId, teacherId });
        k = k + tries + 1;
        break;
      }
    }
  }
  await chunked(entries, 1000, (part) => db.timetableEntry.createMany({ data: part, skipDuplicates: true }));

  // Attendance: ~12 weeks of school days. Most students ~94%; a few (every 23rd) ~68% so "at risk" has entries.
  const days: string[] = [];
  for (let d = addDaysIso(today, -84); d < today; d = addDaysIso(d, 1))
    if (isSchoolDay(d) && d >= year.startsOn.toISOString().slice(0, 10)) days.push(d);
  const batches: Prisma.AttendanceBatchCreateManyInput[] = [];
  const records: Prisma.AttendanceRecordCreateManyInput[] = [];
  const statusFor = (risky: boolean): 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' => {
    const r = rand();
    if (risky) return r < 0.62 ? 'PRESENT' : r < 0.68 ? 'LATE' : r < 0.97 ? 'ABSENT' : 'LEAVE';
    return r < 0.9 ? 'PRESENT' : r < 0.95 ? 'LATE' : r < 0.985 ? 'ABSENT' : 'LEAVE';
  };
  // Today: about two thirds of registers already taken (so "registers not taken" has something to show).
  const todayDone = new Set(sections.filter((_, i) => i % 3 !== 2).map((s) => s.id));
  for (const s of sections) {
    const submitter = s.classTeacherId ? teachers.find((x) => x.id === s.classTeacherId)!.userId : admin.id;
    for (const d of isSchoolDay(today) && todayDone.has(s.id) ? [...days, today] : days) {
      const id = crypto.randomUUID();
      batches.push({
        id,
        tenantId: t,
        sectionId: s.id,
        date: new Date(`${d}T00:00:00Z`),
        period: 1,
        submittedBy: submitter,
        clientUuid: crypto.randomUUID(),
        serverReceivedAt: new Date(`${d}T03:15:00Z`),
      });
      for (const st of s.students)
        records.push({
          tenantId: t,
          batchId: id,
          studentId: st.id,
          status: statusFor((st.rollNumber ?? 0) % 23 === 7),
        });
    }
  }
  await chunked(batches, 1000, (part) => db.attendanceBatch.createMany({ data: part }));
  await chunked(records, 3000, (part) => db.attendanceRecord.createMany({ data: part }));

  // Teacher check-ins: last 30 school days, plus most teachers today.
  const checkins: Prisma.TeacherAttendanceCreateManyInput[] = [];
  for (const d of days.slice(-30)) {
    for (const tch of teachers) {
      const r = rand();
      const status = r < 0.88 ? 'PRESENT' : r < 0.95 ? 'LATE' : 'ABSENT';
      checkins.push({
        tenantId: t,
        teacherId: tch.id,
        date: new Date(`${d}T00:00:00Z`),
        status,
        checkedInAt:
          status === 'ABSENT' ? null : new Date(`${d}T0${status === 'LATE' ? '3:25' : '2:5' + between(0, 9)}:00Z`),
      });
    }
  }
  if (isSchoolDay(today)) {
    for (const [i, tch] of teachers.entries()) {
      if (i % 4 === 3 || tch.user.username === 'bss-t-alikhan-1') continue; // a few (incl. the demo teacher) haven't checked in yet
      checkins.push({
        tenantId: t,
        teacherId: tch.id,
        date: new Date(`${today}T00:00:00Z`),
        status: i % 7 === 5 ? 'LATE' : 'PRESENT',
        checkedInAt: new Date(`${today}T02:5${i % 10}:00Z`),
      });
    }
  }
  await chunked(checkins, 2000, (part) => db.teacherAttendance.createMany({ data: part, skipDuplicates: true }));

  // Tests & marks: per section, Mathematics & English "Unit Test 1" (published), "Unit Test 2" (submitted, waiting to publish).
  const scheme = await db.gradingScheme.findFirstOrThrow({
    where: { academicYearId: year.id },
    orderBy: { version: 'desc' },
  });
  const marks: Prisma.MarkCreateManyInput[] = [];
  const subjectsByName = new Map((await db.subject.findMany({ where: { tenantId: t } })).map((x) => [x.name, x.id]));
  for (const s of sections) {
    for (const subjName of ['Mathematics', 'English']) {
      const subjectId = subjectsByName.get(subjName);
      const teacherAssign = s.assignments.find((a) => a.subjectId === subjectId);
      if (!subjectId || !teacherAssign) continue;
      const teacherUser = teachers.find((x) => x.id === teacherAssign.teacherId)!.userId;
      for (const [n, status, ago] of [
        [1, 'PUBLISHED', 40],
        [2, 'SUBMITTED', 6],
      ] as const) {
        const id = crypto.randomUUID();
        const heldOn = addDaysIso(today, -ago);
        await db.assessment.create({
          data: {
            id,
            tenantId: t,
            academicYearId: year.id,
            sectionId: s.id,
            subjectId,
            gradingSchemeId: scheme.id,
            name: `Unit Test ${n}`,
            maxMarks: 25,
            heldOn: new Date(`${heldOn}T00:00:00Z`),
            status,
            createdBy: teacherUser,
            submittedBy: teacherUser,
            submittedAt: new Date(`${addDaysIso(heldOn, 2)}T09:00:00Z`),
            publishedBy: status === 'PUBLISHED' ? admin.id : null,
            publishedAt: status === 'PUBLISHED' ? new Date(`${addDaysIso(heldOn, 4)}T09:00:00Z`) : null,
          },
        });
        for (const st of s.students) {
          const absent = rand() < 0.03;
          const ability = 0.55 + (((st.rollNumber ?? 1) * 37) % 40) / 100;
          const score = absent
            ? null
            : Math.max(0, Math.min(25, Math.round((ability * 25 + (rand() - 0.5) * 6) * 2) / 2));
          marks.push({ tenantId: t, assessmentId: id, studentId: st.id, score, absent, updatedBy: teacherUser });
        }
      }
    }
  }
  await chunked(marks, 3000, (part) => db.mark.createMany({ data: part }));

  // Leave & remarks around the demo section (8-A for Bright Star, first section otherwise).
  const focus = sections.find((s) => s.class.name === '8' && s.name === 'A') ?? sections[0];
  if (focus) {
    const types = await Promise.all(
      ['Sick leave', 'Casual leave', 'Family emergency', 'Official duty'].map((name, i) =>
        db.leaveType.upsert({
          where: { tenantId_name: { tenantId: t, name } },
          create: { tenantId: t, name, forStudents: i < 3, forStaff: true },
          update: {},
        }),
      ),
    );
    const kids = focus.students.filter((s) => s.rollNumber !== 14).slice(0, 4);
    for (const [i, k] of kids.entries()) {
      const from = addDaysIso(today, i + 1);
      await db.leaveRequest.create({
        data: {
          tenantId: t,
          applicantId: k.userId,
          studentId: k.id,
          typeId: types[i % 2]!.id,
          fromDate: new Date(`${from}T00:00:00Z`),
          toDate: new Date(`${addDaysIso(from, i % 2)}T00:00:00Z`),
          reason: [
            'Fever and flu, doctor advised rest.',
            'Cousin’s wedding in Multan.',
            'Dental appointment.',
            'Family travel.',
          ][i]!,
          status: i === 3 ? 'APPROVED' : 'PENDING',
          decidedBy:
            i === 3 && focus.classTeacherId ? teachers.find((x) => x.id === focus.classTeacherId)!.userId : null,
          decidedAt: i === 3 ? new Date() : null,
        },
      });
    }
    const someTeacher = teachers.find((x) => x.user.username !== 'bss-t-alikhan-1') ?? teachers[0];
    if (someTeacher) {
      await db.leaveRequest.create({
        data: {
          tenantId: t,
          applicantId: someTeacher.userId,
          typeId: types[1]!.id,
          fromDate: new Date(`${addDaysIso(today, 3)}T00:00:00Z`),
          toDate: new Date(`${addDaysIso(today, 4)}T00:00:00Z`),
          reason: 'Attending a training workshop.',
        },
      });
    }
    const author = focus.assignments[0]
      ? teachers.find((x) => x.id === focus.assignments[0]!.teacherId)!.userId
      : admin.id;
    const notes = [
      'Very attentive in class and asks good questions.',
      'Needs to complete homework on time.',
      'Excellent improvement in mathematics this term.',
    ];
    for (const [i, k] of focus.students.slice(0, 3).entries()) {
      await db.remark.create({
        data: {
          tenantId: t,
          studentId: k.id,
          authorId: author,
          subjectName: 'Mathematics',
          text: notes[i]!,
          status: i === 0 ? 'APPROVED' : 'PENDING',
          moderatedBy: i === 0 ? admin.id : null,
          moderatedAt: i === 0 ? new Date() : null,
        },
      });
    }
  }
  console.log(
    `${tenant.name}: ${entries.length} timetable entries, ${batches.length} registers, ${records.length} attendance records, ${marks.length} marks.`,
  );
}

// ── Finance demo: fee setup, months of bills (mostly paid), proofs waiting, expenses, salaries, payroll ──
async function seedFinance(prefix: string) {
  const tenant = await db.tenant.findUnique({ where: { prefix } });
  if (!tenant) return;
  const t = tenant.id;
  if ((await db.feeHead.count({ where: { tenantId: t } })) > 0) {
    console.log(`${tenant.name}: finance data already present.`);
    return;
  }
  const year = await db.academicYear.findFirst({ where: { tenantId: t, status: 'CURRENT' } });
  if (!year) return;
  const rnd = prng(prefix === 'bss' ? 77 : 78);
  const today = dayInKarachi();
  const admin = await db.user.findFirstOrThrow({ where: { tenantId: t, role: 'SCHOOL_ADMIN' } });
  const accountant = (await db.user.findFirst({ where: { tenantId: t, role: 'ACCOUNTANT' } })) ?? admin;
  const seq: Record<string, number> = { INVOICE: 1, RECEIPT: 1, VOUCHER: 1, PAYSLIP: 1 };
  const num = (kind: 'INVOICE' | 'RECEIPT' | 'VOUCHER' | 'PAYSLIP') =>
    `${kind[0]}-${String(seq[kind]!++).padStart(6, '0')}`;

  // Fee heads and per-class amounts (tuition rises with the class).
  const tuition = await db.feeHead.create({ data: { tenantId: t, name: 'Tuition', kind: 'MONTHLY' } });
  const transport = await db.feeHead.create({ data: { tenantId: t, name: 'Transport', kind: 'MONTHLY' } });
  const exam = await db.feeHead.create({ data: { tenantId: t, name: 'Exam', kind: 'TERM' } });
  await db.feeHead.create({ data: { tenantId: t, name: 'Admission', kind: 'ONCE' } });
  const classes = await db.class.findMany({ where: { academicYearId: year.id }, orderBy: { gradeLevel: 'asc' } });
  const amountFor = (grade: number, head: string) =>
    head === 'tuition' ? (3500 + grade * 350) * 100 : head === 'transport' ? 1500 * 100 : 2000 * 100;
  await db.feeStructure.createMany({
    data: classes.flatMap((c) => [
      {
        tenantId: t,
        academicYearId: year.id,
        classId: c.id,
        feeHeadId: tuition.id,
        amountPaisa: amountFor(c.gradeLevel, 'tuition'),
      },
      {
        tenantId: t,
        academicYearId: year.id,
        classId: c.id,
        feeHeadId: transport.id,
        amountPaisa: amountFor(c.gradeLevel, 'transport'),
      },
      {
        tenantId: t,
        academicYearId: year.id,
        classId: c.id,
        feeHeadId: exam.id,
        amountPaisa: amountFor(c.gradeLevel, 'exam'),
      },
    ]),
  });
  await db.lateFeeRule.create({
    data: { tenantId: t, academicYearId: year.id, graceDays: 5, kind: 'FIXED', value: 50000 },
  });

  const students = await db.student.findMany({
    where: { tenantId: t, status: 'ACTIVE', sectionId: { not: null } },
    include: { section: { include: { class: true } }, user: { select: { username: true } } },
    orderBy: { createdAt: 'asc' },
  });
  // A few sibling / scholarship discounts and transport opt-outs.
  for (const s of students.filter((_, i) => i % 23 === 0).slice(0, 12)) {
    await db.feeDiscount.create({
      data: {
        tenantId: t,
        studentId: s.id,
        feeHeadId: null,
        kind: 'PERCENT',
        value: 2500,
        reason: 'Sibling discount',
        validFrom: year.startsOn,
        createdBy: admin.id,
      },
    });
  }
  for (const s of students.filter((_, i) => i % 23 === 7).slice(0, 6)) {
    await db.feeDiscount.create({
      data: {
        tenantId: t,
        studentId: s.id,
        feeHeadId: tuition.id,
        kind: 'PERCENT',
        value: 10000,
        reason: 'Scholarship',
        validFrom: year.startsOn,
        createdBy: admin.id,
      },
    });
  }
  const noTransport = new Set(students.filter((_, i) => i % 3 === 0).map((s) => s.id));
  await db.studentFeeOverride.createMany({
    data: [...noTransport].map((studentId) => ({
      tenantId: t,
      studentId,
      feeHeadId: transport.id,
      amountPaisa: 0,
      note: 'Walks to school',
    })),
  });
  const discounts = await db.feeDiscount.findMany({ where: { tenantId: t } });
  const discountOf = (studentId: string, headId: string) =>
    discounts.find((d) => d.studentId === studentId && d.feeHeadId === headId) ??
    discounts.find((d) => d.studentId === studentId && d.feeHeadId === null) ??
    null;

  // Months from the year's start to this month.
  const months: string[] = [];
  for (let d = year.startsOn.toISOString().slice(0, 7); d <= today.slice(0, 7);) {
    months.push(d);
    const [y, m] = d.split('-').map(Number);
    d = m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`;
  }
  const methods = ['CASH', 'CASH', 'CASH', 'BANK', 'JAZZCASH', 'EASYPAISA'] as const;
  let pendingClaims = 0;
  for (const period of months) {
    const issuedOn = `${period}-01`;
    const dueOn = addDaysIso(issuedOn, 10);
    const isCurrent = period === today.slice(0, 7);
    const termStart = [4, 9, 1].includes(Number(period.slice(5, 7)));
    for (const s of students) {
      const grade = s.section!.class.gradeLevel;
      const lines: { feeHeadId: string; description: string; amountPaisa: number; discountPaisa: number }[] = [];
      const push = (head: { id: string; name: string }, amount: number, label = head.name) => {
        if (amount <= 0) return;
        const d = discountOf(s.id, head.id);
        const discount = d
          ? d.kind === 'PERCENT'
            ? Math.round((amount * d.value) / 10000)
            : Math.min(amount, d.value)
          : 0;
        lines.push({ feeHeadId: head.id, description: label, amountPaisa: amount, discountPaisa: discount });
      };
      push(tuition, amountFor(grade, 'tuition'));
      push(transport, noTransport.has(s.id) ? 0 : amountFor(grade, 'transport'));
      if (termStart)
        push(
          exam,
          amountFor(grade, 'exam'),
          `Exam (${period.slice(0, 4)}-T${termStart ? [4, 9, 1].indexOf(Number(period.slice(5, 7))) + 1 : 1})`,
        );
      const subtotal = lines.reduce((a, l) => a + l.amountPaisa, 0);
      const discount = lines.reduce((a, l) => a + l.discountPaisa, 0);
      const total = subtotal - discount;
      // Past months: 85% paid in full, 7% partly, 8% unpaid. This month: 40% paid so far.
      const r = rnd();
      // The two demo logins always have this month's bill open, so the fee demo works on day one.
      const demoLogin = ['bss-8a-ahmad-14', 'bss-8a-ayesha-15'].includes(s.user.username ?? '');
      const paid =
        isCurrent && demoLogin
          ? 0
          : isCurrent
            ? r < 0.4
              ? total
              : 0
            : r < 0.85
              ? total
              : r < 0.92
                ? Math.round(total * 0.5)
                : 0;
      const status = paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'DUE';
      const inv = await db.invoice.create({
        data: {
          tenantId: t,
          studentId: s.id,
          academicYearId: year.id,
          period,
          number: num('INVOICE'),
          issuedOn: new Date(`${issuedOn}T00:00:00Z`),
          dueOn: new Date(`${dueOn}T00:00:00Z`),
          subtotalPaisa: subtotal,
          discountPaisa: discount,
          paidPaisa: paid,
          status,
          lateFeePaisa: status === 'PAID' ? 0 : null,
          generatedBy: null,
          lines: { create: lines.map((l) => ({ tenantId: t, ...l })) },
        },
      });
      if (paid > 0) {
        const method = methods[Math.floor(rnd() * methods.length)]!;
        const receivedOn = addDaysIso(issuedOn, Math.floor(rnd() * 9));
        const payment = await db.payment.create({
          data: {
            tenantId: t,
            studentId: s.id,
            invoiceId: inv.id,
            amountPaisa: paid,
            method,
            reference: method === 'CASH' ? null : `TX${Math.floor(rnd() * 9_000_000 + 1_000_000)}`,
            receivedOn: new Date(`${receivedOn}T00:00:00Z`),
            receivedBy: accountant.id,
            receiptNumber: num('RECEIPT'),
            allocations: { create: { tenantId: t, invoiceId: inv.id, amountPaisa: paid } },
          },
        });
        await db.ledgerEntry.create({
          data: {
            tenantId: t,
            entryOn: payment.receivedOn,
            kind: 'FEE',
            direction: 'IN',
            amountPaisa: paid,
            method,
            refTable: 'payments',
            refId: payment.id,
            studentId: s.id,
            createdBy: accountant.id,
          },
        });
      } else if (isCurrent && pendingClaims < 5 && rnd() < 0.08) {
        pendingClaims++;
        await db.paymentClaim.create({
          data: {
            tenantId: t,
            studentId: s.id,
            invoiceId: inv.id,
            amountPaisa: total,
            method: 'EASYPAISA',
            reference: `EP${Math.floor(rnd() * 9_000_000 + 1_000_000)}`,
            paidOn: new Date(`${today}T00:00:00Z`),
          },
        });
      }
    }
  }

  // Expenses: a few categories, ~4 per month.
  const catNames = ['Utilities', 'Repairs & maintenance', 'Stationery', 'Transport fuel', 'Events'];
  const cats = [];
  for (const name of catNames) cats.push(await db.expenseCategory.create({ data: { tenantId: t, name } }));
  const salariesCat = await db.expenseCategory.create({ data: { tenantId: t, name: 'Salaries', system: true } });
  const payees: Record<string, string[]> = {
    Utilities: ['LESCO', 'SNGPL', 'PTCL'],
    'Repairs & maintenance': ['Ali Electric Works', 'Hamza Plumbing'],
    Stationery: ['Book Depot', 'Paper House'],
    'Transport fuel': ['PSO pump'],
    Events: ['Decor & Tents'],
  };
  for (const period of months) {
    for (let i = 0; i < 4; i++) {
      const cat = cats[Math.floor(rnd() * cats.length)]!;
      const spentOn = addDaysIso(`${period}-01`, Math.floor(rnd() * 27));
      if (spentOn > today) continue;
      const amount = Math.round((5000 + rnd() * 60000) / 100) * 100 * 100;
      const method = rnd() < 0.6 ? 'CASH' : 'BANK';
      const e = await db.expense.create({
        data: {
          tenantId: t,
          categoryId: cat.id,
          amountPaisa: amount,
          spentOn: new Date(`${spentOn}T00:00:00Z`),
          paidTo: payees[cat.name]![Math.floor(rnd() * payees[cat.name]!.length)]!,
          method,
          voucherNumber: num('VOUCHER'),
          enteredBy: accountant.id,
        },
      });
      await db.ledgerEntry.create({
        data: {
          tenantId: t,
          entryOn: e.spentOn,
          kind: 'EXPENSE',
          direction: 'OUT',
          amountPaisa: amount,
          method,
          refTable: 'expenses',
          refId: e.id,
          createdBy: accountant.id,
        },
      });
    }
  }

  // Salaries for every staff member; payroll for the previous two months, paid.
  const staff = await db.user.findMany({ where: { tenantId: t, role: { not: 'STUDENT' }, deletedAt: null } });
  const basicFor = (role: UserRole) =>
    role === 'SCHOOL_ADMIN'
      ? 120000
      : role === 'PRINCIPAL'
        ? 150000
        : role === 'ACCOUNTANT'
          ? 70000
          : role === 'ADMISSIONS_OFFICER'
            ? 55000
            : 45000 + Math.floor(rnd() * 25) * 1000;
  for (const u of staff) {
    const basic = basicFor(u.role) * 100;
    await db.salaryStructure.create({
      data: {
        tenantId: t,
        userId: u.id,
        basicPaisa: basic,
        allowances: [{ name: 'House rent', amountPaisa: Math.round(basic * 0.1) }],
        deductions: [{ name: 'Staff fund', amountPaisa: 100000 }],
        effectiveFrom: year.startsOn,
        updatedBy: admin.id,
      },
    });
  }
  const structures = await db.salaryStructure.findMany({ where: { tenantId: t } });
  for (const period of months.slice(-3, -1)) {
    const run = await db.payrollRun.create({
      data: { tenantId: t, period, status: 'PAID', runBy: accountant.id, finalisedAt: new Date() },
    });
    let total = 0;
    const paidOn = addDaysIso(`${period}-01`, 32 + 4); // the 5th of the next month
    const paidDate = new Date(`${paidOn.slice(0, 7)}-05T00:00:00Z`);
    for (const st of structures) {
      const allowances = st.allowances as { name: string; amountPaisa: number }[];
      const deductions = st.deductions as { name: string; amountPaisa: number }[];
      const net =
        Number(st.basicPaisa) +
        allowances.reduce((a, x) => a + x.amountPaisa, 0) -
        deductions.reduce((a, x) => a + x.amountPaisa, 0);
      const slip = await db.payslip.create({
        data: {
          tenantId: t,
          payrollRunId: run.id,
          userId: st.userId,
          number: num('PAYSLIP'),
          basicPaisa: st.basicPaisa,
          allowances,
          deductions,
          allowancesPaisa: allowances.reduce((a, x) => a + x.amountPaisa, 0),
          deductionsPaisa: deductions.reduce((a, x) => a + x.amountPaisa, 0),
          netPaisa: net,
          paidOn: paidDate,
          method: 'BANK',
        },
      });
      await db.ledgerEntry.create({
        data: {
          tenantId: t,
          entryOn: paidDate,
          kind: 'SALARY',
          direction: 'OUT',
          amountPaisa: net,
          method: 'BANK',
          refTable: 'payslips',
          refId: slip.id,
          userId: st.userId,
          createdBy: accountant.id,
        },
      });
      total += net;
    }
    await db.payrollRun.update({ where: { id: run.id }, data: { totalPaisa: total } });
    await db.expense.create({
      data: {
        tenantId: t,
        categoryId: salariesCat.id,
        amountPaisa: total,
        spentOn: paidDate,
        paidTo: `Staff salaries ${period} (${structures.length})`,
        method: 'BANK',
        voucherNumber: num('VOUCHER'),
        note: `Payroll ${period}`,
        enteredBy: accountant.id,
      },
    });
  }
  await db.financeSequence.createMany({
    data: (['INVOICE', 'RECEIPT', 'VOUCHER', 'PAYSLIP'] as const).map((kind) => ({
      tenantId: t,
      kind,
      next: seq[kind]!,
    })),
  });
  console.log(
    `${tenant.name}: finance seeded (${months.length} months, ${students.length} students, ${staff.length} staff).`,
  );
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demo accounts in production (set DEMO_SEED=true for a demo deployment)');
  }
  passwordHash = await hash(DEMO_PASSWORD, ARGON2);
  for (const u of PLATFORM_USERS) await upsertUser(u, null);
  await seedBrightStar();
  await seedGreenValley();
  await seedOperations('bss');
  await seedOperations('gvs');
  await seedAnnouncements('bss');
  await seedAnnouncements('gvs');
  await seedPlatform();
  await seedFinance('bss');
  await seedFinance('gvs');
  console.log(`Seed complete. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
