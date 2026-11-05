import { beforeEach, describe, expect, it } from 'vitest';
import * as login from '@/app/api/v1/auth/[portal]/login/route';
import * as importStudents from '@/app/api/v1/imports/students/route';
import * as importTemplate from '@/app/api/v1/imports/students/template/route';
import * as importCommit from '@/app/api/v1/imports/[id]/commit/route';
import * as repAtRisk from '@/app/api/v1/reports/at-risk/route';
import * as repAttendance from '@/app/api/v1/reports/attendance/route';
import * as searchRoute from '@/app/api/v1/search/route';
import * as announcements from '@/app/api/v1/announcements/route';
import * as announcementById from '@/app/api/v1/announcements/[id]/route';
import * as notifications from '@/app/api/v1/notifications/route';
import * as auditLogs from '@/app/api/v1/audit-logs/route';
import { systemDb } from '@/server/db/system';
import { writeXlsx, zip } from '@/server/files/xlsx';
import { cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call } from './helpers/http';

/** Phase 4 behaviour: bulk import, reports & exports, search scopes, announcements, audit log. */

let f: Fixtures;
let admin: string;
let ao: string;
let teacher: string;
let principal: string;
let student: string;

beforeEach(async () => {
  f = await seedFixtures();
  [admin, ao, teacher, principal, student] = await Promise.all([
    cookieFor(f.a.SCHOOL_ADMIN),
    cookieFor(f.a.ADMISSIONS_OFFICER),
    cookieFor(f.a.TEACHER),
    cookieFor(f.a.PRINCIPAL),
    cookieFor(f.a.STUDENT),
  ]);
});

const HEADER = 'Student name,Class,Section,Admission no,Gender,Date of birth,Guardian name,Guardian phone,Address';
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');
const upload = (cookie: string, fileName: string, data: string, clientKey = crypto.randomUUID()) =>
  call(importStudents.POST, { cookie, body: { fileName, data, clientKey } });
const commit = (cookie: string, id: string) => call(importCommit.POST, { method: 'POST', cookie, params: { id } });

describe('bulk student import (spec §8.8, §9.5)', () => {
  it('previews with row errors, then admits only valid rows with one-time logins', async () => {
    const csv = [
      HEADER,
      'Ayesha Khan,8,A,ADM-1,Female,21/05/2014,Mr Khan,0300 1234567,Street 1',
      'Bilal Ahmed,8,b,,male,2014-01-02,,,',
      'Sana Iqbal,8,A,ADM-2,,,,,',
      'No Section,9,Z,,,,,,',
      'Bad Phone,8,A,,,,,12ab,',
      'Dup Admission,8,A,ADM-1,,,,,',
      ',,,,,,,,',
    ].join('\n');
    const r = await upload(ao, 'students.csv', b64(csv));
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    const p = r.json.import;
    expect(p).toMatchObject({ total: 6, valid: 3 });
    expect(p.errors.map((e: { row: number; column: string }) => `${e.row}:${e.column}`)).toEqual([
      '5:Class / Section',
      '6:Guardian phone',
      '7:Admission no',
    ]);
    expect(await systemDb().student.count({ where: { tenantId: f.tenantA.id } })).toBe(1); // nothing created yet

    const c = await commit(ao, p.id);
    expect(c.json).toMatchObject({ finished: true, created: 3 });
    expect(c.json.credentials).toHaveLength(3);
    const ayesha = c.json.credentials[0];
    expect(ayesha.username).toMatch(/^sca-8a-ayesha-\d+$/);
    const user = await systemDb().user.findFirstOrThrow({ where: { username: ayesha.username } });
    expect(user.mustChangePassword).toBe(true);
    const s = await systemDb().student.findFirstOrThrow({ where: { userId: user.id } });
    expect(s).toMatchObject({ admissionNo: 'ADM-1', gender: 'FEMALE', guardianPhone: '03001234567' });
    expect(s.dateOfBirth?.toISOString().slice(0, 10)).toBe('2014-05-21');

    // The temporary password works once, on the student portal, and forces a change.
    const signIn = await call(login.POST, {
      params: { portal: 'student' },
      body: { identifier: ayesha.username, password: ayesha.temporaryPassword },
    });
    expect(signIn.status).toBe(200);
    expect(signIn.json).toMatchObject({ mustChangePassword: true });

    // Committing again never admits anyone twice; passwords are never shown again.
    const again = await commit(ao, p.id);
    expect(again.json).toMatchObject({ finished: true, credentials: [] });
    expect(await systemDb().student.count({ where: { tenantId: f.tenantA.id } })).toBe(4);
    expect(JSON.stringify(await systemDb().job.findUniqueOrThrow({ where: { id: p.id } }))).not.toContain(
      ayesha.temporaryPassword,
    );
  });

  it('re-sending the same upload returns the same preview (idempotency key)', async () => {
    const key = crypto.randomUUID();
    const csv = b64([HEADER, 'Hina Rafiq,8,A,,,,,,'].join('\n'));
    const one = await upload(admin, 'a.csv', csv, key);
    const two = await upload(admin, 'a.csv', csv, key);
    expect(two.json.import.id).toBe(one.json.import.id);
    expect(await systemDb().job.count({ where: { type: 'student_import' } })).toBe(1);
  });

  it('imports large files in chunks; concurrent commits never duplicate', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => `Student ${i + 1},8,B,,,,,,`);
    const p = (await upload(admin, 'big.csv', b64([HEADER, ...rows].join('\n')))).json.import;
    expect(p.valid).toBe(150);
    const [a, b] = await Promise.all([commit(admin, p.id), commit(admin, p.id)]);
    const created = [a, b].reduce((n, r) => n + r.json.credentials.length, 0);
    expect(created).toBe(100); // one call did the chunk, the other waited and found it done
    const rest = await commit(admin, p.id);
    expect(rest.json).toMatchObject({ finished: true, created: 150 });
    expect(rest.json.credentials).toHaveLength(50);
    const rolls = await systemDb().student.findMany({
      where: { sectionId: f.s.sectionA8B },
      select: { rollNumber: true },
    });
    expect(new Set(rolls.map((r) => r.rollNumber)).size).toBe(150);
  });

  it('reads the Excel template format and rejects formulas', async () => {
    const tpl = await call(importTemplate.GET, { cookie: admin });
    expect(tpl.headers.get('content-type')).toContain('spreadsheetml');
    const xlsx = writeXlsx([
      { name: 'Students', rows: [HEADER.split(','), ['Zara Malik', '8', 'A', '', 'F', '', '', '', '']] },
    ]);
    const ok = await upload(admin, 'students.xlsx', b64(xlsx));
    expect(ok.json.import).toMatchObject({ valid: 1, total: 1 });

    const sheet = `<worksheet><sheetData><row r="1">${HEADER.split(',')
      .map((h, i) => `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>${h}</t></is></c>`)
      .join('')}</row><row r="2"><c r="A2" t="str"><f>CONCAT("a","b")</f><v>ab</v></c></row></sheetData></worksheet>`;
    const evil = zip([
      {
        name: 'xl/workbook.xml',
        data: Buffer.from(
          '<workbook xmlns:r="r"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
        ),
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
    ]);
    const bad = await upload(admin, 'evil.xlsx', b64(evil));
    expect(bad.status).toBe(422);
    expect(bad.json.error.message).toMatch(/formula/);
  });

  it('rejects names that look like formulas and old .xls files', async () => {
    const r = await upload(admin, 'x.csv', b64([HEADER, '=HYPERLINK("http://evil"),8,A,,,,,,'].join('\n')));
    expect(r.json.import.errors[0]).toMatchObject({ column: 'Student name', message: 'Looks like a formula' });
    const xls = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(64)]);
    expect((await upload(admin, 'old.xls', b64(xls))).json.error.message).toMatch(/\.xlsx/);
  });

  it('an import only ever sees and writes the caller’s school', async () => {
    const r = await upload(admin, 'x.csv', b64([HEADER, 'Other School Kid,9,B,,,,,,'].join('\n')));
    // School B has a 9-B; School A doesn't, so the row is rejected rather than placed cross-tenant.
    expect(r.json.import.valid).toBe(0);
    const other = await cookieFor(f.b.SCHOOL_ADMIN);
    expect((await commit(other, r.json.import.id)).status).toBe(404);
  });
});

describe('search scopes (spec §8.9)', () => {
  beforeEach(async () => {
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { guardianPhone: '03001112233' } });
    await systemDb().user.update({ where: { id: f.a.STUDENT.id }, data: { displayName: 'Muhammad Usman' } });
    await systemDb().user.update({ where: { id: f.b.STUDENT.id }, data: { displayName: 'Muhammad Usman' } });
  });
  const find = (cookie: string, q: string) =>
    call(searchRoute.GET, { cookie, path: `/api/v1/search?q=${encodeURIComponent(q)}` });

  it('finds by name with typos, never across schools', async () => {
    const r = await find(admin, 'Muhamad Usman');
    expect(r.json.students.map((s: { id: string }) => s.id)).toEqual([f.s.studentA]);
    expect(r.json.students[0]).toMatchObject({ section: '8-A', username: 'sca-8a-student-1' });
  });

  it('teachers only find students in their own sections', async () => {
    await systemDb().student.update({ where: { id: f.s.studentA }, data: { sectionId: f.s.sectionA8B } });
    expect((await find(teacher, 'Usman')).json.students).toHaveLength(0);
    expect((await find(admin, 'Usman')).json.students).toHaveLength(1);
  });

  it('guardian-phone lookup is for the School Admin and Admissions only', async () => {
    expect((await find(admin, '1112233')).json.students).toHaveLength(1);
    expect((await find(ao, '1112233')).json.students).toHaveLength(1);
    expect((await find(principal, '1112233')).json.students).toHaveLength(0);
    expect((await find(teacher, '1112233')).json.students).toHaveLength(0);
  });

  it('LIKE wildcards in the query are treated literally', async () => {
    expect((await find(admin, '%%')).json.students).toHaveLength(0);
  });
});

describe('announcements (spec §8.11)', () => {
  const post = (cookie: string, body: Record<string, unknown>) =>
    call(announcements.POST, { cookie, body: { title: 'Sports day', body: 'Wear whites', ...body } });
  const titles = async (cookie: string) =>
    ((await call(announcements.GET, { cookie })).json.items as { title: string }[]).map((a) => a.title);

  it('a section announcement reaches that section’s students and teachers, not others', async () => {
    const r = await post(admin, { audience: 'SECTION', sectionId: f.s.sectionA8A, title: '8-A trip' });
    expect(r.status).toBe(201);
    expect(r.json.recipients).toBe(2); // student A + their teacher
    expect(await titles(student)).toContain('8-A trip');
    expect((await call(notifications.GET, { cookie: student })).json.items[0].title).toBe('8-A trip');
    expect(await titles(await cookieFor(f.b.STUDENT))).toHaveLength(0);
  });

  it('staff-only posts are hidden from students; removed and expired posts disappear', async () => {
    await post(principal, { audience: 'STAFF', title: 'Staff meeting' });
    expect(await titles(teacher)).toContain('Staff meeting');
    expect(await titles(student)).not.toContain('Staff meeting');

    const r = await post(admin, { audience: 'EVERYONE', title: 'Holiday' });
    expect(await titles(student)).toContain('Holiday');
    expect(
      (await call(announcementById.DELETE, { method: 'DELETE', cookie: admin, params: { id: r.json.id } })).status,
    ).toBe(200);
    expect(await titles(student)).not.toContain('Holiday');
    expect(await systemDb().announcement.count({ where: { id: r.json.id } })).toBe(1); // soft-deleted, kept for audit

    const old = await post(admin, { audience: 'EVERYONE', title: 'Old news' });
    await systemDb().announcement.update({ where: { id: old.json.id }, data: { expiresOn: new Date('2020-01-01') } });
    expect(await titles(student)).not.toContain('Old news');
  });

  it('a section must be chosen for section posts, and must belong to the school', async () => {
    expect((await post(admin, { audience: 'SECTION' })).status).toBe(422);
    expect((await post(admin, { audience: 'SECTION', sectionId: f.s.sectionB9B })).status).toBe(404);
  });
});

describe('reports and exports (spec §8.10)', () => {
  async function makeAtRisk() {
    await systemDb().user.update({ where: { id: f.a.STUDENT.id }, data: { displayName: '=HYPERLINK("http://evil")' } });
    for (let d = 1; d <= 12; d++) {
      const date = new Date(Date.UTC(2026, 8, d));
      await systemDb().attendanceBatch.create({
        data: {
          tenantId: f.tenantA.id,
          sectionId: f.s.sectionA8A,
          date,
          period: 1,
          submittedBy: f.a.TEACHER.id,
          clientUuid: crypto.randomUUID(),
          records: {
            create: [{ tenantId: f.tenantA.id, studentId: f.s.studentA, status: d <= 3 ? 'PRESENT' : 'ABSENT' }],
          },
        },
      });
    }
  }

  it('the at-risk list includes guardian contacts for the School Admin only', async () => {
    await makeAtRisk();
    const a = await call(repAtRisk.GET, { cookie: admin });
    expect(a.json.rows[0]).toMatchObject({ id: f.s.studentA, pct: 25, absent: 9, guardianPhone: '03001111111' });
    const p = await call(repAtRisk.GET, { cookie: principal });
    expect(p.json.rows[0].guardianPhone).toBeUndefined();
    const pCsv = await call(repAtRisk.GET, { cookie: principal, path: '/api/v1/reports/at-risk?format=csv' });
    expect(String(pCsv.json)).not.toContain('Guardian');
  });

  it('CSV exports neutralise formulas and download as attachments', async () => {
    await makeAtRisk();
    const r = await call(repAtRisk.GET, { cookie: admin, path: '/api/v1/reports/at-risk?format=csv' });
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(String(r.json)).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('attendance report by section and date range', async () => {
    await makeAtRisk();
    const r = await call(repAttendance.GET, {
      cookie: admin,
      path: `/api/v1/reports/attendance?sectionId=${f.s.sectionA8A}&from=2026-09-01&to=2026-09-05`,
    });
    expect(r.json).toMatchObject({ kind: 'section', registers: 5, overallPct: 60 });
    expect(r.json.rows[0]).toMatchObject({ PRESENT: 3, ABSENT: 2 });
    const school = await call(repAttendance.GET, {
      cookie: admin,
      path: '/api/v1/reports/attendance?from=2026-09-01&to=2026-09-30',
    });
    expect(school.json.rows.find((x: { id: string }) => x.id === f.s.sectionA8A)).toMatchObject({
      registers: 12,
      pct: 25,
      below: 1,
    });
  });
});

describe('audit log viewer', () => {
  it('shows only the school’s own entries, filterable by category', async () => {
    await call(announcements.POST, { cookie: admin, body: { title: 'Logged post', body: 'x', audience: 'EVERYONE' } });
    await call(announcements.POST, {
      cookie: await cookieFor(f.b.SCHOOL_ADMIN),
      body: { title: 'Other school', body: 'x', audience: 'EVERYONE' },
    });
    const r = await call(auditLogs.GET, { cookie: admin, path: '/api/v1/audit-logs?category=announcement' });
    expect(r.json.items).toHaveLength(1);
    expect(r.json.items[0]).toMatchObject({ action: 'announcement.create', actorRole: 'SCHOOL_ADMIN' });
    const ids = (await call(auditLogs.GET, { cookie: admin })).json.items.map((i: { id: string }) => i.id);
    const tenants = await systemDb().auditLog.findMany({ where: { id: { in: ids } }, select: { tenantId: true } });
    expect(new Set(tenants.map((t) => t.tenantId))).toEqual(new Set([f.tenantA.id]));
  });
});
