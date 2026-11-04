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
  a: Record<'SCHOOL_ADMIN' | 'PRINCIPAL' | 'ADMISSIONS_OFFICER' | 'TEACHER' | 'STUDENT', FixtureUser>;
  b: Record<'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT', FixtureUser>;
  owner: FixtureUser;
  platformAdmin: FixtureUser;
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
  return {
    tenantA: { id: tA.id, prefix: tA.prefix },
    tenantB: { id: tB.id, prefix: tB.prefix },
    a: {
      SCHOOL_ADMIN: await user(tA.id, 'SCHOOL_ADMIN', { email: 'admin@a.test' }),
      PRINCIPAL: await user(tA.id, 'PRINCIPAL', { email: 'principal@a.test' }),
      ADMISSIONS_OFFICER: await user(tA.id, 'ADMISSIONS_OFFICER', { email: 'admissions@a.test' }),
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
