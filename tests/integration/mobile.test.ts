import { beforeAll, describe, expect, it } from 'vitest';
import * as login from '@/app/api/v1/auth/[portal]/login/route';
import * as me from '@/app/api/v1/auth/me/route';
import * as logout from '@/app/api/v1/auth/logout/route';
import * as home from '@/app/api/v1/mobile/home/route';
import * as config from '@/app/api/v1/mobile/config/route';
import * as pushToken from '@/app/api/v1/me/push-token/route';
import * as changePassword from '@/app/api/v1/auth/change-password/route';
import { systemDb } from '@/server/db/system';
import { PASSWORD, cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call, setCookieValue } from './helpers/http';

/** Native app contract (spec §3.3): bearer token sign-in, one-call home per role, push tokens. */

let f: Fixtures;
beforeAll(async () => {
  f = await seedFixtures();
});

describe('bearer sessions', () => {
  it('the app gets a token in the body (no cookie) and uses it as Authorization: Bearer', async () => {
    const r = await call(login.POST, {
      params: { portal: 'staff' },
      headers: { 'x-edusaas-client': 'android/1.0.0' },
      body: { identifier: f.a.TEACHER.login, password: PASSWORD },
    });
    expect(r.status).toBe(200);
    expect(typeof r.json.token).toBe('string');
    expect(setCookieValue(r.headers, 'edu_session')).toBeUndefined();
    const who = await call(me.GET, { headers: { authorization: `Bearer ${r.json.token}` } });
    expect(who.status).toBe(200);
    expect(who.json.user.id).toBe(f.a.TEACHER.id);
    // Web sign-in is unchanged: cookie, no token in the body.
    const web = await call(login.POST, {
      params: { portal: 'staff' },
      body: { identifier: f.a.TEACHER.login, password: PASSWORD },
    });
    expect(web.json.token).toBeUndefined();
    expect(setCookieValue(web.headers, 'edu_session')).toBeTruthy();
    // Logout revokes the bearer session.
    expect(
      (await call(logout.POST, { method: 'POST', headers: { authorization: `Bearer ${r.json.token}` } })).status,
    ).toBe(200);
    expect((await call(me.GET, { headers: { authorization: `Bearer ${r.json.token}` } })).status).toBe(401);
  });

  it('a password change hands the phone its new session instead of signing it out', async () => {
    const mobile = { 'x-edusaas-client': 'android/1.0.0' };
    const r = await call(login.POST, {
      params: { portal: 'staff' },
      headers: mobile,
      body: { identifier: f.a.ADMISSIONS_OFFICER.login, password: PASSWORD },
    });
    const old = r.json.token as string;
    const changed = await call(changePassword.POST, {
      method: 'POST',
      headers: { ...mobile, authorization: `Bearer ${old}` },
      body: { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-77' },
    });
    expect(changed.status).toBe(200);
    expect(typeof changed.json.token).toBe('string');
    expect(setCookieValue(changed.headers, 'edu_session')).toBeUndefined();
    expect((await call(me.GET, { headers: { authorization: `Bearer ${old}` } })).status).toBe(401);
    const who = await call(me.GET, { headers: { authorization: `Bearer ${changed.json.token}` } });
    expect(who.status).toBe(200);
    expect(who.json.user.id).toBe(f.a.ADMISSIONS_OFFICER.id);
  });

  it('rejects a garbage bearer token', async () => {
    expect((await call(me.GET, { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
  });
});

describe('home payload', () => {
  it('is shaped by role and never includes other schools', async () => {
    const student = await call(home.GET, { cookie: await cookieFor(f.a.STUDENT) });
    expect(student.json.kind).toBe('student');
    expect(student.json).toHaveProperty('fees');
    const teacher = await call(home.GET, { cookie: await cookieFor(f.a.TEACHER) });
    expect(teacher.json.kind).toBe('teacher');
    expect(teacher.json.overview.sections.map((s: { label: string }) => s.label)).toEqual(['8-A']);
    const admin = await call(home.GET, { cookie: await cookieFor(f.a.SCHOOL_ADMIN) });
    expect(admin.json.kind).toBe('school');
    expect(admin.json.counts.students).toBe(1);
    const acc = await call(home.GET, { cookie: await cookieFor(f.a.ACCOUNTANT) });
    expect(acc.json.kind).toBe('accountant');
    expect(acc.json.finance).toHaveProperty('outstandingPaisa');
    const owner = await call(home.GET, { cookie: await cookieFor(f.owner) });
    expect(owner.json.kind).toBe('platform');
    expect(owner.json.overview.schools.total).toBe(2);
    const cfg = await call(config.GET);
    expect(cfg.json.minVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('push tokens', () => {
  it('registers one row per device, re-owns it on sign-in by another user, and removes it', async () => {
    const token = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
    expect((await call(pushToken.POST, { cookie: await cookieFor(f.a.STUDENT), body: { token } })).status).toBe(200);
    expect((await call(pushToken.POST, { cookie: await cookieFor(f.a.TEACHER), body: { token } })).status).toBe(200);
    const rows = await systemDb().pushToken.findMany({ where: { token } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(f.a.TEACHER.id);
    expect((await call(pushToken.POST, { cookie: await cookieFor(f.a.TEACHER), body: { token: 'bad' } })).status).toBe(
      422,
    );
    expect(
      (await call(pushToken.DELETE, { cookie: await cookieFor(f.a.TEACHER), method: 'DELETE', body: { token } }))
        .status,
    ).toBe(200);
    expect(await systemDb().pushToken.count({ where: { token } })).toBe(0);
  });
});
