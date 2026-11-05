import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as students from '@/app/api/v1/students/route';
import * as studentPhoto from '@/app/api/v1/students/[id]/photo/route';
import * as mePhoto from '@/app/api/v1/me/photo/route';
import * as archiveById from '@/app/api/v1/archives/[id]/route';
import * as studentArchivesRoute from '@/app/api/v1/students/[id]/archives/route';
import * as batches from '@/app/api/v1/attendance/batches/route';
import * as sheet from '@/app/api/v1/attendance/sheet/route';
import * as attMe from '@/app/api/v1/attendance/me/route';
import * as pAdmins from '@/app/api/v1/platform/admins/route';
import * as pAdminById from '@/app/api/v1/platform/admins/[id]/route';
import * as pPlans from '@/app/api/v1/platform/plans/route';
import * as pPlanById from '@/app/api/v1/platform/plans/[id]/route';
import * as pSubscription from '@/app/api/v1/platform/tenants/[id]/subscription/route';
import * as pTickets from '@/app/api/v1/platform/tickets/route';
import * as pTicketReply from '@/app/api/v1/platform/tickets/[id]/reply/route';
import * as pSupportRequestById from '@/app/api/v1/platform/support-requests/[id]/route';
import * as pAudit from '@/app/api/v1/platform/audit/route';
import * as tenantSupport from '@/app/api/v1/platform/tenants/[id]/support/route';
import * as supportView from '@/app/api/v1/platform/tenants/[id]/support/view/route';
import * as supportGrants from '@/app/api/v1/support-grants/route';
import * as supportDecision from '@/app/api/v1/support-grants/[id]/decision/route';
import * as sTickets from '@/app/api/v1/support/tickets/route';
import * as sTicketReply from '@/app/api/v1/support/tickets/[id]/reply/route';
import * as notifications from '@/app/api/v1/notifications/route';
import * as leave from '@/app/api/v1/leave/route';
import * as leaveTypes from '@/app/api/v1/leave/types/route';
import * as leaveTypeById from '@/app/api/v1/leave/types/[id]/route';
import { systemDb } from '@/server/db/system';
import { setStorageForTests, storage, type StorageService } from '@/server/files/storage';
import { YEAR_ARCHIVE, archiveAuditMonths, processYearArchives, yearArchivePayload } from '@/server/jobs/archive';
import { cookieFor, seedFixtures, type FixtureUser, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Phase 6: the spec gaps closed after the deep review (photos, archival, SaaS, platform admins, tickets, per-period). */

let f: Fixtures;
let admin: string;
let teacher: string;
let student: string;
let owner: string;
beforeEach(async () => {
  f = await seedFixtures();
  setStorageForTests(undefined);
  [admin, teacher, student, owner] = await Promise.all([
    cookieFor(f.a.SCHOOL_ADMIN),
    cookieFor(f.a.TEACHER),
    cookieFor(f.a.STUDENT),
    cookieFor(f.owner),
  ]);
});
afterEach(() => setStorageForTests(undefined));

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
const jpeg = (size = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 7)]);

describe('profile photos (Phase 2, §9.5, §12.1)', () => {
  it('stores a sniffed image privately and serves it only to people who may see the student', async () => {
    const put = await call(studentPhoto.PUT, {
      method: 'PUT',
      cookie: admin,
      params: { id: f.s.studentA },
      body: { data: jpeg().toString('base64') },
    });
    expect(put.status, JSON.stringify(put.json)).toBe(200);
    const get = await call(studentPhoto.GET, { cookie: teacher, params: { id: f.s.studentA } });
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/jpeg');
    expect(get.headers.get('cache-control')).toContain('private');
    expect((await call(mePhoto.GET, { cookie: student })).status).toBe(200);
    // Other school, and a teacher whose sections don't include the student: nothing.
    expect(
      (await call(studentPhoto.GET, { cookie: await cookieFor(f.b.SCHOOL_ADMIN), params: { id: f.s.studentA } }))
        .status,
    ).toBe(404);
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { sectionId: f.s.sectionA8B } });
    expect((await call(studentPhoto.GET, { cookie: teacher, params: { id: f.s.studentA } })).status).toBe(404);
    const key = (await systemDb().student.findUniqueOrThrow({ where: { id: f.s.studentA } })).photoKey!;
    expect(key).toMatch(new RegExp(`^photos/${f.tenantA.id}/students/[0-9a-f]{24}\\.jpg$`));
    expect(await systemDb().auditLog.count({ where: { action: 'student.photo' } })).toBe(1);
  });

  it('rejects non-images (by content, not name), oversized files, and replaces the old file', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(100)]).toString('base64');
    expect(
      (
        await call(studentPhoto.PUT, {
          method: 'PUT',
          cookie: admin,
          params: { id: f.s.studentA },
          body: { data: gif },
        })
      ).status,
    ).toBe(422);
    const big = jpeg(310 * 1024).toString('base64');
    expect(
      (
        await call(studentPhoto.PUT, {
          method: 'PUT',
          cookie: admin,
          params: { id: f.s.studentA },
          body: { data: big },
        })
      ).status,
    ).toBe(422);
    await call(studentPhoto.PUT, {
      method: 'PUT',
      cookie: admin,
      params: { id: f.s.studentA },
      body: { data: jpeg().toString('base64') },
    });
    const first = (await systemDb().student.findUniqueOrThrow({ where: { id: f.s.studentA } })).photoKey!;
    await call(studentPhoto.PUT, {
      method: 'PUT',
      cookie: admin,
      params: { id: f.s.studentA },
      body: { data: jpeg(3000).toString('base64') },
    });
    expect(await storage()!.get(first)).toBeNull();
    await call(studentPhoto.DELETE, { method: 'DELETE', cookie: admin, params: { id: f.s.studentA } });
    expect((await call(studentPhoto.GET, { cookie: admin, params: { id: f.s.studentA } })).status).toBe(404);
  });

  it('explains when file storage isn’t set up', async () => {
    setStorageForTests(null);
    const r = await call(studentPhoto.PUT, {
      method: 'PUT',
      cookie: admin,
      params: { id: f.s.studentA },
      body: { data: jpeg().toString('base64') },
    });
    expect(r.status).toBe(409);
    expect(r.json.error.message).toMatch(/storage/);
  });
});

async function yearData() {
  const db = systemDb();
  const scheme = await db.gradingScheme.create({
    data: {
      tenantId: f.tenantA.id,
      academicYearId: f.s.yearA,
      version: 1,
      bands: [
        { grade: 'A', min: 80 },
        { grade: 'B', min: 60 },
        { grade: 'F', min: 0 },
      ],
    },
  });
  const a = await db.assessment.create({
    data: {
      tenantId: f.tenantA.id,
      academicYearId: f.s.yearA,
      sectionId: f.s.sectionA8A,
      subjectId: f.s.subjMath,
      gradingSchemeId: scheme.id,
      name: 'Final',
      maxMarks: 50,
      heldOn: new Date('2026-09-10'),
      status: 'PUBLISHED',
      createdBy: f.a.TEACHER.id,
    },
  });
  await db.mark.create({ data: { tenantId: f.tenantA.id, assessmentId: a.id, studentId: f.s.studentA, score: 42 } });
  for (let d = 1; d <= 4; d++)
    await db.attendanceBatch.create({
      data: {
        tenantId: f.tenantA.id,
        sectionId: f.s.sectionA8A,
        date: new Date(Date.UTC(2026, 8, d)),
        period: 1,
        submittedBy: f.a.TEACHER.id,
        clientUuid: crypto.randomUUID(),
        records: {
          create: [{ tenantId: f.tenantA.id, studentId: f.s.studentA, status: d === 4 ? 'ABSENT' : 'PRESENT' }],
        },
      },
    });
  return db.job.create({
    data: {
      tenantId: f.tenantA.id,
      type: YEAR_ARCHIVE,
      status: 'QUEUED',
      payload: yearArchivePayload(f.s.yearA, '2026-27', [f.s.studentA]),
      progress: { done: 0, archived: 0, failed: [] },
    },
  });
}

describe('year archive after promotion (§5.4, §10.2)', () => {
  it('stores a verified report card, then removes that year’s raw rows; the card stays downloadable', async () => {
    const job = await yearData();
    await processYearArchives(10);
    const arch = await systemDb().studentArchive.findFirstOrThrow({ where: { studentId: f.s.studentA } });
    expect(arch.storageKey).toBe(`reports/sca/2026-27/${f.s.studentA}-report-card.pdf`);
    expect(await systemDb().attendanceRecord.count({ where: { studentId: f.s.studentA } })).toBe(0);
    expect(await systemDb().mark.count({ where: { studentId: f.s.studentA } })).toBe(0);
    expect(await systemDb().attendanceBatch.count({ where: { sectionId: f.s.sectionA8A } })).toBe(0); // emptied registers go too
    expect((await systemDb().job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('SUCCEEDED');

    const pdf = await call(archiveById.GET, { cookie: student, params: { id: arch.id } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(
      (await call(studentArchivesRoute.GET, { cookie: teacher, params: { id: f.s.studentA } })).json.items,
    ).toHaveLength(1);
    expect(
      (await call(archiveById.GET, { cookie: await cookieFor(f.b.STUDENT), params: { id: arch.id } })).status,
    ).toBe(404);
    expect(
      (await call(archiveById.GET, { cookie: await cookieFor(f.a.ADMISSIONS_OFFICER), params: { id: arch.id } }))
        .status,
    ).toBe(403);
  });

  it('keeps the raw records when the upload can’t be verified', async () => {
    const job = await yearData();
    const broken: StorageService = {
      driver: 'local',
      put: async () => undefined,
      get: async () => ({ body: new Uint8Array([1, 2, 3]), contentType: 'application/pdf' }),
      delete: async () => undefined,
    };
    setStorageForTests(broken);
    await processYearArchives(10);
    expect(await systemDb().attendanceRecord.count({ where: { studentId: f.s.studentA } })).toBe(4);
    expect(await systemDb().mark.count({ where: { studentId: f.s.studentA } })).toBe(1);
    expect((await systemDb().job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('FAILED');
  });

  it('waits (deletes nothing) while storage isn’t configured', async () => {
    await yearData();
    setStorageForTests(null);
    expect(await processYearArchives(10)).toMatch(/^skipped/);
    expect(await systemDb().attendanceRecord.count({ where: { studentId: f.s.studentA } })).toBe(4);
  });
});

describe('monthly audit archive (§10.3)', () => {
  it('moves finished months to a gzip file, then deletes only those rows', async () => {
    const db = systemDb();
    for (let i = 0; i < 3; i++)
      await db.auditLog.create({
        data: {
          tenantId: f.tenantA.id,
          action: 'test.old',
          entity: 'X',
          createdAt: new Date(Date.UTC(2026, 8, 10 + i)),
        },
      });
    const recent = await db.auditLog.count({ where: { tenantId: f.tenantA.id } });
    const done = (await archiveAuditMonths(new Date())) as {
      tenant: string | null;
      month: string;
      rows: number;
      deleted?: number;
    }[];
    expect(done.find((d) => d.tenant === f.tenantA.id && d.month === '2026-09')).toMatchObject({ rows: 3, deleted: 3 });
    expect(await db.auditLog.count({ where: { tenantId: f.tenantA.id } })).toBe(recent - 3);
    const arch = await db.auditArchive.findFirstOrThrow({ where: { tenantId: f.tenantA.id, month: '2026-09' } });
    const file = await storage()!.get(arch.storageKey);
    const lines = zlib.gunzipSync(Buffer.from(file!.body)).toString().split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]!).action).toBe('test.old');
  });

  it('the database refuses to delete audit rows without an archive, or for the current month', async () => {
    const db = systemDb();
    await expect(db.$queryRaw`SELECT delete_archived_audit_month(${f.tenantB.id}::uuid, '2026-09')`).rejects.toThrow(
      /no archive recorded/,
    );
    const now = new Date().toISOString().slice(0, 7);
    await db.auditArchive.create({
      data: { tenantId: f.tenantB.id, month: now, storageKey: 'x', rows: 0, sha256: 'x' },
    });
    await expect(db.$queryRaw`SELECT delete_archived_audit_month(${f.tenantB.id}::uuid, ${now})`).rejects.toThrow(
      /current month/,
    );
  });
});

describe('plans & subscriptions (§2.7, §8 SaaS)', () => {
  const admit = (cookie: string, name: string) =>
    call(students.POST, { cookie, body: { displayName: name, sectionId: f.s.sectionA8A } });

  it('enforces the plan’s student limit and a cancelled subscription, for that school only', async () => {
    const plan = await call(pPlans.POST, {
      cookie: owner,
      body: { name: 'Tiny', priceMonthly: 1000, maxStudents: 1, maxStaff: null },
    });
    expect(plan.status).toBe(201);
    const id = plan.json.plan.id;
    expect(
      (
        await call(pSubscription.PUT, {
          method: 'PUT',
          cookie: owner,
          params: { id: f.tenantA.id },
          body: { planId: id, status: 'ACTIVE' },
        })
      ).status,
    ).toBe(200);
    const blocked = await admit(admin, 'One Too Many');
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.message).toMatch(/allows 1 active students/);

    await call(pPlanById.PUT, {
      method: 'PUT',
      cookie: owner,
      params: { id },
      body: { name: 'Tiny', priceMonthly: 1000, maxStudents: null, maxStaff: null },
    });
    expect((await admit(admin, 'Now Fine')).status).toBe(201);

    await call(pSubscription.PUT, {
      method: 'PUT',
      cookie: owner,
      params: { id: f.tenantA.id },
      body: { planId: id, status: 'CANCELLED' },
    });
    expect((await admit(admin, 'Cancelled')).json.error.message).toMatch(/cancelled/);
    // School B has no subscription: unaffected.
    const b = await call(students.POST, {
      cookie: await cookieFor(f.b.SCHOOL_ADMIN),
      body: { displayName: 'B Kid', sectionId: f.s.sectionB9B },
    });
    expect(b.status).toBe(201);
    const usage = await call(pSubscription.GET, { cookie: owner, params: { id: f.tenantA.id } });
    expect(usage.json.usage).toMatchObject({ students: 2 });
    expect(await systemDb().auditLog.count({ where: { action: 'subscription.change', tenantId: f.tenantA.id } })).toBe(
      2,
    );
  });
});

describe('Platform Admins (§2.7, §2.8)', () => {
  it('the Owner creates one, grants exactly what they may do, and can switch them off at once', async () => {
    const r = await call(pAdmins.POST, {
      cookie: owner,
      body: { displayName: 'Ops Two', email: 'ops2@platform.test', permissions: ['platform.support.queue'] },
    });
    expect(r.status).toBe(201);
    expect(r.json.admin.temporaryPassword).toMatch(/^\S{4}-\S{4}-\S{4}$/);
    await systemDb().user.update({ where: { id: r.json.admin.id }, data: { mustChangePassword: false } });
    const ops: FixtureUser = {
      id: r.json.admin.id,
      role: 'PLATFORM_ADMIN',
      tenantId: null,
      login: 'ops2@platform.test',
    };
    const c = await cookieFor(ops);
    expect((await call(pTickets.GET, { cookie: c })).status).toBe(200);
    expect((await call(pPlans.GET, { cookie: c })).status).toBe(403);
    expect((await call(pAdmins.GET, { cookie: c })).status).toBe(403);

    await call(pAdminById.PATCH, { method: 'PATCH', cookie: owner, params: { id: ops.id }, body: { permissions: [] } });
    expect((await call(pTickets.GET, { cookie: c })).status).toBe(403);
    await call(pAdminById.PATCH, {
      method: 'PATCH',
      cookie: owner,
      params: { id: ops.id },
      body: { status: 'DISABLED' },
    });
    expect((await call(pTickets.GET, { cookie: c })).status).toBe(401);
  });

  it('a Platform Admin’s support access needs the Owner first, then the school', async () => {
    await systemDb().platformPermissionGrant.create({
      data: { userId: f.platformAdmin.id, permission: 'platform.support.access', grantedBy: f.owner.id },
    });
    const ops = await cookieFor(f.platformAdmin);
    const ask = await call(tenantSupport.POST, {
      cookie: ops,
      params: { id: f.tenantA.id },
      body: { reason: 'Ticket: attendance totals look wrong', durationMinutes: 60 },
    });
    expect(ask.status).toBe(201);
    expect(ask.json.grant.status).toBe('AWAITING_OWNER');
    const g = ask.json.grant.id as string;
    // The school sees it but can't approve yet, and wasn't notified.
    expect(
      (await call(supportDecision.POST, { cookie: admin, params: { id: g }, body: { decision: 'APPROVE' } })).status,
    ).toBe(409);
    expect((await call(notifications.GET, { cookie: admin })).json.items).toHaveLength(0);

    expect(
      (await call(pSupportRequestById.POST, { cookie: owner, params: { id: g }, body: { decision: 'APPROVE' } }))
        .status,
    ).toBe(200);
    expect((await call(notifications.GET, { cookie: admin })).json.items[0].title).toBe('Support access requested');
    expect(
      (await call(supportDecision.POST, { cookie: admin, params: { id: g }, body: { decision: 'APPROVE' } })).status,
    ).toBe(200);
    expect((await call(supportView.GET, { cookie: ops, params: { id: f.tenantA.id } })).status).toBe(200);
    // The grant is personal: even the Owner can't use the admin's access.
    expect((await call(supportView.GET, { cookie: owner, params: { id: f.tenantA.id } })).status).toBe(403);
    expect((await call(supportGrants.GET, { cookie: admin })).json.items[0].ownerApprovedBy).toBe(f.owner.id);
  });
});

describe('support tickets (§2.8)', () => {
  it('a school asks, the platform answers, the school is told; schools never see each other’s', async () => {
    const t = await call(sTickets.POST, {
      cookie: admin,
      body: { subject: 'Cannot print slips', body: 'Where is the print button?' },
    });
    expect(t.status).toBe(201);
    const queue = await call(pTickets.GET, { cookie: owner });
    expect(queue.json.items[0]).toMatchObject({ subject: 'Cannot print slips', school: { name: 'School A' } });
    expect(
      (
        await call(pTicketReply.POST, {
          cookie: owner,
          params: { id: t.json.id },
          body: { body: 'Press Print slips after import.' },
        })
      ).status,
    ).toBe(200);
    expect((await call(notifications.GET, { cookie: admin })).json.items[0].title).toBe('EDUsaas support replied');
    const mine = (await call(sTickets.GET, { cookie: admin })).json.items[0];
    expect(mine).toMatchObject({ status: 'ANSWERED' });
    expect(mine.messages).toHaveLength(2);
    await call(sTicketReply.POST, {
      cookie: admin,
      params: { id: t.json.id },
      body: { body: 'Thanks, one more thing' },
    });
    expect((await call(sTickets.GET, { cookie: admin })).json.items[0].status).toBe('OPEN');
    expect((await call(sTickets.GET, { cookie: await cookieFor(f.b.SCHOOL_ADMIN) })).json.items).toHaveLength(0);
    expect((await call(sTickets.GET, { cookie: teacher })).status).toBe(403);
  });
});

describe('platform audit log (§2.7)', () => {
  it('shows platform actions in full and school activity as metadata only', async () => {
    await call(sTickets.POST, { cookie: admin, body: { subject: 'Hello there', body: 'Question' } });
    await call(pAdmins.POST, { cookie: owner, body: { displayName: 'Ops Three', email: 'ops3@platform.test' } });
    const all = (await call(pAudit.GET, { cookie: owner, path: '/api/v1/platform/audit?scope=all' })).json.items as {
      action: string;
      details: unknown;
      school: string | null;
    }[];
    const school = all.find((e) => e.action === 'ticket.open')!;
    expect(school).toMatchObject({ school: 'School A', details: null });
    expect(all.find((e) => e.action === 'platform_admin.create')!.details).not.toBeNull();
  });
});

describe('per-period attendance (§6.6)', () => {
  async function slots() {
    const dow = ((new Date(`${today()}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
    const db = systemDb();
    const s1 = await db.timetableSlot.create({
      data: { tenantId: f.tenantA.id, dayOfWeek: dow, periodNo: 1, startsAt: '08:00', endsAt: '08:40' },
    });
    await db.timetableSlot.create({
      data: { tenantId: f.tenantA.id, dayOfWeek: dow, periodNo: 2, startsAt: '08:40', endsAt: '09:20' },
    });
    await db.timetableEntry.create({
      data: {
        tenantId: f.tenantA.id,
        sectionId: f.s.sectionA8A,
        slotId: s1.id,
        subjectId: f.s.subjMath,
        teacherId: f.s.teacherA,
      },
    });
  }
  const take = (period: number | undefined, status: string) =>
    call(batches.POST, {
      cookie: teacher,
      body: {
        sectionId: f.s.sectionA8A,
        date: today(),
        clientUuid: crypto.randomUUID(),
        ...(period ? { period } : {}),
        records: [{ studentId: f.s.studentA, status }],
      },
    });

  it('one register per period; percentages count every period', async () => {
    await systemDb().tenantSettings.update({
      where: { tenantId: f.tenantA.id },
      data: { attendanceMode: 'PER_PERIOD' },
    });
    await slots();
    const s = await call(sheet.GET, { cookie: teacher, path: `/api/v1/attendance/sheet?sectionId=${f.s.sectionA8A}` });
    expect(s.json.periods.map((p: { label: string }) => p.label)).toEqual(['P1 · 08:00 · Mathematics', 'P2 · 08:40']);
    expect((await take(1, 'PRESENT')).status).toBe(200);
    expect((await take(2, 'ABSENT')).status).toBe(200);
    expect((await take(9, 'PRESENT')).status).toBe(422);
    const b = await systemDb().attendanceBatch.findMany({
      where: { sectionId: f.s.sectionA8A },
      orderBy: { period: 'asc' },
    });
    expect(b.map((x) => [x.period, x.subjectId])).toEqual([
      [1, f.s.subjMath],
      [2, null],
    ]);
    expect((await call(attMe.GET, { cookie: student })).json.pct).toBe(50);
  });

  it('once-daily schools only have the whole-day register', async () => {
    await slots();
    expect((await take(2, 'PRESENT')).status).toBe(422);
    expect((await take(undefined, 'PRESENT')).status).toBe(200);
  });
});

describe('leave types (§8)', () => {
  it('a retired type disappears from the apply form and can’t be used', async () => {
    const types = (await call(leaveTypes.GET, { cookie: student })).json.items as { id: string; name: string }[];
    const sick = types.find((t) => t.name === 'Sick leave')!;
    expect(
      (
        await call(leaveTypeById.PATCH, {
          method: 'PATCH',
          cookie: admin,
          params: { id: sick.id },
          body: { archived: true },
        })
      ).status,
    ).toBe(200);
    expect(
      ((await call(leaveTypes.GET, { cookie: student })).json.items as { name: string }[]).map((t) => t.name),
    ).not.toContain('Sick leave');
    const r = await call(leave.POST, {
      cookie: student,
      body: { typeId: sick.id, fromDate: today(), toDate: today(), reason: 'Fever' },
    });
    expect(r.status).toBe(422);
  });
});
