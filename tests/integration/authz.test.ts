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

let prefixCounter = 0;

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
    expect(ids).toHaveLength(5);
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
    expect(keys).toEqual(['city', 'createdAt', 'id', 'name', 'prefix', 'status', 'suspendedAt', 'userCount']);
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
