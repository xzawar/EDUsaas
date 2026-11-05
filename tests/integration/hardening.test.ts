import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';
import * as login from '@/app/api/v1/auth/[portal]/login/route';
import * as forgot from '@/app/api/v1/auth/forgot-password/route';
import * as tenantSupport from '@/app/api/v1/platform/tenants/[id]/support/route';
import * as supportView from '@/app/api/v1/platform/tenants/[id]/support/view/route';
import * as adminReset from '@/app/api/v1/platform/tenants/[id]/admin-reset/route';
import * as supportGrants from '@/app/api/v1/support-grants/route';
import * as decision from '@/app/api/v1/support-grants/[id]/decision/route';
import * as reportCard from '@/app/api/v1/students/[id]/report-card/route';
import * as reportCardMe from '@/app/api/v1/report-card/me/route';
import * as notifications from '@/app/api/v1/notifications/route';
import * as users from '@/app/api/v1/users/route';
import { GET as cron } from '@/app/api/internal/cron/daily/route';
import { systemDb } from '@/server/db/system';
import { anonymizeWithdrawn, atRiskDigest, leaveEscalations } from '@/server/jobs/daily';
import { refreshDemoData } from '@/server/jobs/demo';
import { PASSWORD, cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Phase 5: break-glass support, report cards, retention & scheduled jobs, rate limits. */

let f: Fixtures;
let owner: string;
let admin: string;
beforeEach(async () => {
  f = await seedFixtures();
  [owner, admin] = await Promise.all([cookieFor(f.owner), cookieFor(f.a.SCHOOL_ADMIN)]);
});

describe('break-glass support access (spec §2.7, §9.6)', () => {
  const ask = () =>
    call(tenantSupport.POST, {
      cookie: owner,
      params: { id: f.tenantA.id },
      body: { reason: 'Ticket 42: attendance totals look wrong', durationMinutes: 60 },
    });
  const view = () => call(supportView.GET, { cookie: owner, params: { id: f.tenantA.id } });

  it('no access until the school approves; every view is logged in the school; the school can end it', async () => {
    const r = await ask();
    expect(r.status).toBe(201);
    expect((await view()).status).toBe(403);
    expect((await ask()).status).toBe(409); // one open request at a time

    // The School Admin is told and decides.
    const note = (await call(notifications.GET, { cookie: admin })).json.items[0];
    expect(note.title).toBe('Support access requested');
    const grants = (await call(supportGrants.GET, { cookie: admin })).json.items;
    expect(grants[0]).toMatchObject({ status: 'PENDING', reason: 'Ticket 42: attendance totals look wrong' });
    expect(
      (await call(decision.POST, { cookie: admin, params: { id: grants[0].id }, body: { decision: 'APPROVE' } }))
        .status,
    ).toBe(200);

    const v = await view();
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({ students: 1, teachers: 1 });
    const logged = await systemDb().auditLog.findFirstOrThrow({ where: { action: 'support.view' } });
    expect(logged).toMatchObject({ tenantId: f.tenantA.id, actorId: f.owner.id, supportGrantId: grants[0].id });

    // Even with a grant, the owner still can't use school APIs (no tenant permissions at all).
    expect((await call(users.GET, { cookie: owner })).status).toBe(403);

    expect(
      (await call(decision.POST, { cookie: admin, params: { id: grants[0].id }, body: { decision: 'END' } })).status,
    ).toBe(200);
    expect((await view()).status).toBe(403);
  });

  it('a denied or expired grant gives nothing', async () => {
    await ask();
    let g = await systemDb().supportGrant.findFirstOrThrow();
    await call(decision.POST, { cookie: admin, params: { id: g.id }, body: { decision: 'DENY' } });
    expect((await view()).status).toBe(403);

    await ask();
    g = await systemDb().supportGrant.findFirstOrThrow({ where: { status: 'PENDING' } });
    await call(decision.POST, { cookie: admin, params: { id: g.id }, body: { decision: 'APPROVE' } });
    await systemDb().supportGrant.update({ where: { id: g.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await view()).status).toBe(403);
    expect((await systemDb().supportGrant.findUniqueOrThrow({ where: { id: g.id } })).status).toBe('EXPIRED');
  });

  it('another school can’t see or decide the request', async () => {
    await ask();
    const g = await systemDb().supportGrant.findFirstOrThrow();
    const otherAdmin = await cookieFor(f.b.SCHOOL_ADMIN);
    expect((await call(supportGrants.GET, { cookie: otherAdmin })).json.items).toHaveLength(0);
    expect(
      (await call(decision.POST, { cookie: otherAdmin, params: { id: g.id }, body: { decision: 'APPROVE' } })).status,
    ).toBe(404);
  });

  it('emergency School Admin reset: needs a reason and confirmation, forces a change, and the school is told', async () => {
    const bad = await call(adminReset.POST, {
      cookie: owner,
      params: { id: f.tenantA.id },
      body: { userId: f.a.SCHOOL_ADMIN.id, reason: 'Locked out, called us', confirm: 'yes' },
    });
    expect(bad.status).toBe(422);
    // A user who isn't a School Admin of that school can't be targeted.
    const wrong = await call(adminReset.POST, {
      cookie: owner,
      params: { id: f.tenantA.id },
      body: { userId: f.b.SCHOOL_ADMIN.id, reason: 'Locked out, called us', confirm: 'RESET' },
    });
    expect(wrong.status).toBe(404);

    const r = await call(adminReset.POST, {
      cookie: owner,
      params: { id: f.tenantA.id },
      body: { userId: f.a.SCHOOL_ADMIN.id, reason: 'Locked out, called us', confirm: 'RESET' },
    });
    expect(r.status).toBe(200);
    expect((await call(users.GET, { cookie: admin })).status).toBe(401); // old sessions revoked
    const signIn = await call(login.POST, {
      params: { portal: 'staff' },
      body: { identifier: 'admin@a.test', password: r.json.temporaryPassword },
    });
    expect(signIn.json).toMatchObject({ mustChangePassword: true });
    const audit = await systemDb().auditLog.findFirstOrThrow({ where: { action: 'support.admin_reset' } });
    expect(audit).toMatchObject({ tenantId: f.tenantA.id, actorId: f.owner.id });
    expect(JSON.stringify(audit)).not.toContain(r.json.temporaryPassword);
  });
});

describe('report card PDF (spec §7.5)', () => {
  it('renders a valid PDF for staff with access and for the student', async () => {
    const r = await call(reportCard.GET, { cookie: admin, params: { id: f.s.studentA } });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    const me = await fetchPdf(reportCardMe.GET, await cookieFor(f.a.STUDENT));
    const doc = await PDFDocument.load(me);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain('Report card');
  });

  it('teachers only get cards for their own sections; Admissions none; no cards after withdrawal', async () => {
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { sectionId: f.s.sectionA8B } });
    expect(
      (await call(reportCard.GET, { cookie: await cookieFor(f.a.TEACHER), params: { id: f.s.studentA } })).status,
    ).toBe(404);
    expect(
      (await call(reportCard.GET, { cookie: await cookieFor(f.a.ADMISSIONS_OFFICER), params: { id: f.s.studentA } }))
        .status,
    ).toBe(403);
    expect((await call(reportCard.GET, { cookie: admin, params: { id: f.s.studentB } })).status).toBe(404);
    await systemDb().student.update({
      where: { id: f.s.studentA },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    expect((await call(reportCard.GET, { cookie: admin, params: { id: f.s.studentA } })).status).toBe(422);
  });
});

async function fetchPdf(
  handler: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>,
  cookie: string,
) {
  const res = await handler(new Request('http://localhost:3000/api/v1/test', { headers: { cookie } }), {
    params: Promise.resolve({}),
  });
  expect(res.status).toBe(200);
  return new Uint8Array(await res.arrayBuffer());
}

describe('retention and scheduled jobs', () => {
  it('anonymises students one year after withdrawal (D7), keeps their history, leaves recent ones alone', async () => {
    const old = new Date(Date.now() - 400 * 86400_000);
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { status: 'WITHDRAWN', withdrawnAt: old } });
    await systemDb().student.update({
      where: { id: f.s.studentB },
      data: { status: 'WITHDRAWN', withdrawnAt: new Date() },
    });
    expect(await anonymizeWithdrawn()).toBe(1);
    const u = await systemDb().user.findUniqueOrThrow({ where: { id: f.a.STUDENT.id } });
    expect(u).toMatchObject({ displayName: 'Former student', status: 'DISABLED' });
    expect(u.username).toMatch(/^sca-former-[0-9a-f]{8}$/);
    const s = await systemDb().student.findUniqueOrThrow({ where: { id: f.s.studentA } });
    expect(s).toMatchObject({ guardianName: null, guardianPhone: null, address: null });
    expect((await systemDb().user.findUniqueOrThrow({ where: { id: f.b.STUDENT.id } })).displayName).not.toBe(
      'Former student',
    );
    expect(await systemDb().auditLog.count({ where: { action: 'retention.anonymize', tenantId: f.tenantA.id } })).toBe(
      1,
    );
    expect(await anonymizeWithdrawn()).toBe(0); // idempotent
  });

  it('tells School Admins about leave that aged out to them', async () => {
    const type = await systemDb().leaveType.create({ data: { tenantId: f.tenantA.id, name: 'Sick' } });
    await systemDb().leaveRequest.create({
      data: {
        tenantId: f.tenantA.id,
        applicantId: f.a.STUDENT.id,
        studentId: f.s.studentA,
        typeId: type.id,
        fromDate: new Date(),
        toDate: new Date(),
        reason: 'Fever',
        createdAt: new Date(Date.now() - 50 * 3600_000),
      },
    });
    expect(await leaveEscalations()).toBe(1);
    const n = (await call(notifications.GET, { cookie: admin })).json.items[0];
    expect(n.title).toBe('1 leave request now need you');
  });

  it('weekly at-risk digest reaches the Class Incharge once', async () => {
    for (let d = 1; d <= 12; d++) {
      await systemDb().attendanceBatch.create({
        data: {
          tenantId: f.tenantA.id,
          sectionId: f.s.sectionA8A,
          date: new Date(Date.UTC(2026, 8, d)),
          period: 1,
          submittedBy: f.a.TEACHER.id,
          clientUuid: crypto.randomUUID(),
          records: {
            create: [{ tenantId: f.tenantA.id, studentId: f.s.studentA, status: d <= 4 ? 'PRESENT' : 'ABSENT' }],
          },
        },
      });
    }
    expect(await atRiskDigest(new Date(), true)).toBe(1);
    expect(await atRiskDigest(new Date(), true)).toBe(0);
    const n = (await call(notifications.GET, { cookie: await cookieFor(f.a.TEACHER) })).json.items[0];
    expect(n.title).toBe('1 student in 8-A below 75%');
  });

  it('demo refresh fills missed school days once, and only on demo deployments', async () => {
    const before = process.env.DEMO_SEED;
    try {
      delete process.env.DEMO_SEED;
      expect(await refreshDemoData(new Date(), ['sca'])).toMatch(/^skipped/);
      process.env.DEMO_SEED = 'true';
      const first = (await refreshDemoData(new Date(), ['sca'])) as Record<
        string,
        { registers: number; checkIns: number }
      >;
      expect(first.sca!.registers).toBeGreaterThan(20); // ~30 days minus Sundays, for 8-A (8-B has no students)
      expect(await systemDb().attendanceBatch.count({ where: { sectionId: f.s.sectionA8B } })).toBe(0);
      expect(await systemDb().attendanceRecord.count({ where: { studentId: f.s.studentA } })).toBe(
        first.sca!.registers,
      );
      const again = (await refreshDemoData(new Date(), ['sca'])) as Record<
        string,
        { registers: number; checkIns: number }
      >;
      expect(again.sca).toEqual({ registers: 0, checkIns: 0 });
      expect(await systemDb().attendanceBatch.count({ where: { tenantId: f.tenantB.id } })).toBe(0);
    } finally {
      if (before === undefined) delete process.env.DEMO_SEED;
      else process.env.DEMO_SEED = before;
    }
  });

  it('the cron endpoint runs every step and reports each one', async () => {
    const r = await call(cron, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(r.status).toBe(200);
    expect(Object.keys(r.json.results)).toEqual([
      'credentials',
      'rateLimits',
      'supportGrantsExpired',
      'leaveEscalationNotices',
      'atRiskDigests',
      'studentsAnonymized',
      'auditArchive',
      'demoData',
    ]);
    expect(JSON.stringify(r.json.results)).not.toContain('error');
  });
});

describe('rate limits (spec §9.4)', () => {
  it('blocks password spraying from one network across many accounts', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.7' };
    for (let i = 0; i < 50; i++) {
      const r = await call(login.POST, {
        headers,
        params: { portal: 'staff' },
        body: { identifier: `nobody${i}@x.test`, password: 'wrong-pass-1' },
      });
      expect(r.status).toBe(401);
    }
    const blocked = await call(login.POST, {
      headers,
      params: { portal: 'staff' },
      body: { identifier: 'admin@a.test', password: PASSWORD },
    });
    expect(blocked.status).toBe(429);
    // A different network is unaffected.
    const other = await call(login.POST, {
      headers: { 'x-forwarded-for': '198.51.100.2' },
      params: { portal: 'staff' },
      body: { identifier: 'admin@a.test', password: PASSWORD },
    });
    expect(other.status).toBe(200);
  });

  it('a whole school signing in from one network is never blocked by successful sign-ins', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.50' };
    for (let i = 0; i < 60; i++) {
      const r = await call(login.POST, {
        headers,
        params: { portal: 'student' },
        body: { identifier: f.a.STUDENT.login, password: PASSWORD },
      });
      expect(r.status).toBe(200);
    }
  });

  it('limits password-reset requests per network', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9' };
    for (let i = 0; i < 10; i++)
      expect((await call(forgot.POST, { headers, body: { email: `x${i}@x.test`, portal: 'staff' } })).status).toBe(200);
    expect((await call(forgot.POST, { headers, body: { email: 'x@x.test', portal: 'staff' } })).status).toBe(429);
  });
});
