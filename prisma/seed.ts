/**
 * Development/demo seed: one platform owner + admin, and TWO schools with one account per role,
 * so cross-tenant isolation can be demonstrated and tested. Credentials are for development only.
 * Uses the system role (BYPASSRLS) because it writes across tenants.
 */
import 'dotenv/config';
import { PrismaClient, type UserRole } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const db = new PrismaClient({ datasourceUrl: process.env.SYSTEM_DATABASE_URL });
const ARGON2 = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

export const DEMO_PASSWORD = 'Demo-pass-2026';

type SeedUser = { role: UserRole; displayName: string; username?: string; email?: string };

const SCHOOLS: { name: string; prefix: string; city: string; users: SeedUser[] }[] = [
  {
    name: 'Bright Star School',
    prefix: 'bss',
    city: 'Lahore',
    users: [
      { role: 'SCHOOL_ADMIN', displayName: 'Sara Ahmed', email: 'admin@bss.test' },
      { role: 'PRINCIPAL', displayName: 'Imran Qureshi', email: 'principal@bss.test' },
      { role: 'ADMISSIONS_OFFICER', displayName: 'Nadia Malik', email: 'admissions@bss.test' },
      { role: 'TEACHER', displayName: 'Ali Khan', username: 'bss-t-alikhan-1' },
      { role: 'STUDENT', displayName: 'Ahmad Raza', username: 'bss-8a-ahmad-14' },
      { role: 'STUDENT', displayName: 'Ayesha Noor', username: 'bss-8a-ayesha-15' },
    ],
  },
  {
    name: 'Green Valley School',
    prefix: 'gvs',
    city: 'Islamabad',
    users: [
      { role: 'SCHOOL_ADMIN', displayName: 'Omar Farooq', email: 'admin@gvs.test' },
      { role: 'TEACHER', displayName: 'Hina Shah', username: 'gvs-t-hinashah-1' },
      { role: 'STUDENT', displayName: 'Bilal Hussain', username: 'gvs-9b-bilal-3' },
    ],
  },
];

const PLATFORM_USERS: SeedUser[] = [
  { role: 'PLATFORM_OWNER', displayName: 'Platform Owner', email: 'owner@edusaas.test' },
  { role: 'PLATFORM_ADMIN', displayName: 'Platform Admin', email: 'ops@edusaas.test' },
];

async function upsertUser(u: SeedUser, tenantId: string | null, passwordHash: string) {
  const data = {
    tenantId,
    role: u.role,
    displayName: u.displayName,
    username: u.username ?? null,
    usernameNormalized: u.username ? normalize(u.username) : null,
    email: u.email ?? null,
    passwordHash,
    mustChangePassword: false,
    status: 'ACTIVE' as const,
    failedLoginAttempts: 0,
    lockedUntil: null,
  };
  const existing = await db.user.findFirst({
    where: u.email ? { email: u.email } : { usernameNormalized: normalize(u.username!) },
  });
  if (existing) await db.user.update({ where: { id: existing.id }, data });
  else await db.user.create({ data });
}

async function main() {
  // Production builds only seed when explicitly asked to (the Vercel demo sets DEMO_SEED=true).
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED !== 'true') {
    throw new Error('Refusing to seed demo accounts in production (set DEMO_SEED=true for a demo deployment)');
  }
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2);

  for (const u of PLATFORM_USERS) await upsertUser(u, null, passwordHash);

  for (const s of SCHOOLS) {
    const tenant = await db.tenant.upsert({
      where: { prefix: s.prefix },
      create: { name: s.name, prefix: s.prefix, city: s.city, status: 'ACTIVE', settings: { create: {} } },
      update: { name: s.name, city: s.city, status: 'ACTIVE', suspendedAt: null },
    });
    for (const u of s.users) await upsertUser(u, tenant.id, passwordHash);
  }

  console.log(`Seeded ${SCHOOLS.length} schools. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
