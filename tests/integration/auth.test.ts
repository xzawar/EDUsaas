import { beforeEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/v1/auth/[portal]/login/route';
import { POST as logout } from '@/app/api/v1/auth/logout/route';
import { GET as me } from '@/app/api/v1/auth/me/route';
import { POST as changePassword } from '@/app/api/v1/auth/change-password/route';
import { POST as forgotPassword } from '@/app/api/v1/auth/forgot-password/route';
import { POST as resetPassword } from '@/app/api/v1/auth/reset-password/route';
import { GET as listUsers } from '@/app/api/v1/users/route';
import { GET as cron } from '@/app/api/internal/cron/daily/route';
import { systemDb } from '@/server/db/system';
import { SESSION_COOKIE } from '@/server/auth/session';
import { setMailer, type MailMessage } from '@/server/mail/mailer';
import { PASSWORD, cookieFor, seedFixtures, type Fixtures } from './helpers/fixtures';
import { call, setCookieValue } from './helpers/http';

let f: Fixtures;
beforeEach(async () => {
  f = await seedFixtures();
});

const doLogin = (portal: string, identifier: string, password = PASSWORD) =>
  call(login, { body: { identifier, password }, params: { portal }, path: `/api/v1/auth/${portal}/login` });

describe('separate login portals (decision D1)', () => {
  it.each([
    ['student', 'a.STUDENT', '/student'],
    ['staff', 'a.TEACHER', '/staff'],
    ['staff', 'a.SCHOOL_ADMIN', '/staff'],
    ['staff', 'a.PRINCIPAL', '/staff'],
    ['staff', 'a.ADMISSIONS_OFFICER', '/staff'],
    ['platform', 'owner', '/platform'],
  ])('%s portal admits %s', async (portal, path, home) => {
    const u = path.split('.').reduce((o: any, k) => o[k], f); // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = await doLogin(portal, u.login);
    expect(r.status).toBe(200);
    expect(r.json.redirectTo).toBe(home);
    expect(setCookieValue(r.headers, SESSION_COOKIE)).toBeTruthy();
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith(SESSION_COOKIE))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it.each([
    ['staff', 'STUDENT'],
    ['platform', 'STUDENT'],
    ['student', 'TEACHER'],
    ['student', 'SCHOOL_ADMIN'],
    ['platform', 'SCHOOL_ADMIN'],
  ] as const)('%s portal rejects a valid %s account with the generic error', async (portal, role) => {
    const r = await doLogin(portal, f.a[role].login);
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe('INVALID_CREDENTIALS');
    const audit = await systemDb().auditLog.findFirst({
      where: { actorId: f.a[role].id, action: 'auth.login' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.outcome).toBe('denied');
    expect((audit?.metadata as { reason: string }).reason).toBe('wrong_portal');
  });

  it('school portals reject a platform owner', async () => {
    expect((await doLogin('staff', f.owner.login)).status).toBe(401);
  });

  it('unknown portal → 404', async () => {
    expect((await doLogin('parents', f.a.STUDENT.login)).status).toBe(404);
  });

  it('a student session cannot call staff-portal APIs', async () => {
    const r = await call(listUsers, { cookie: await cookieFor(f.a.STUDENT) });
    expect(r.status).toBe(403);
  });
});

describe('credentials', () => {
  it('usernames are case- and separator-insensitive (spec §3.2)', async () => {
    expect((await doLogin('student', 'SCA_8A Student.1')).status).toBe(200);
  });

  it('emails are case-insensitive', async () => {
    expect((await doLogin('staff', 'ADMIN@A.TEST')).status).toBe(200);
  });

  it('wrong password and unknown user give the same response', async () => {
    const bad = await doLogin('staff', f.a.SCHOOL_ADMIN.login, 'wrong-pass-1');
    const unknown = await doLogin('staff', 'nobody@nowhere.test');
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.json.error.message).toBe(unknown.json.error.message);
  });

  it('locks after 5 failures for 15 minutes, even with the right password (spec §9.4)', async () => {
    for (let i = 0; i < 5; i++) expect((await doLogin('student', f.a.STUDENT.login, 'nope-nope-1')).status).toBe(401);
    const locked = await doLogin('student', f.a.STUDENT.login);
    expect(locked.status).toBe(423);
    const u = await systemDb().user.findUniqueOrThrow({ where: { id: f.a.STUDENT.id } });
    expect(u.lockedUntil!.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it('a successful login resets the failure counter', async () => {
    for (let i = 0; i < 4; i++) await doLogin('student', f.a.STUDENT.login, 'nope-nope-1');
    expect((await doLogin('student', f.a.STUDENT.login)).status).toBe(200);
    const u = await systemDb().user.findUniqueOrThrow({ where: { id: f.a.STUDENT.id } });
    expect(u.failedLoginAttempts).toBe(0);
  });

  it('disabled accounts cannot sign in and existing sessions stop working', async () => {
    const cookie = await cookieFor(f.a.TEACHER);
    await systemDb().user.update({ where: { id: f.a.TEACHER.id }, data: { status: 'DISABLED' } });
    expect((await doLogin('staff', f.a.TEACHER.login)).status).toBe(401);
    expect((await call(me, { cookie })).status).toBe(401);
  });

  it('suspended schools cannot sign in and existing sessions stop working', async () => {
    const cookie = await cookieFor(f.a.SCHOOL_ADMIN);
    await systemDb().tenant.update({ where: { id: f.tenantA.id }, data: { status: 'SUSPENDED' } });
    expect((await doLogin('staff', f.a.SCHOOL_ADMIN.login)).status).toBe(401);
    expect((await call(me, { cookie })).status).toBe(401);
    // School B unaffected.
    expect((await doLogin('staff', f.b.SCHOOL_ADMIN.login)).status).toBe(200);
  });

  it('logins are audited without secrets', async () => {
    await doLogin('staff', f.a.SCHOOL_ADMIN.login);
    const rows = await systemDb().auditLog.findMany({ where: { actorId: f.a.SCHOOL_ADMIN.id } });
    expect(rows.some((r) => r.action === 'auth.login' && r.outcome === 'success')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });
});

describe('sessions', () => {
  it('rejects missing, garbage and expired sessions', async () => {
    expect((await call(me)).status).toBe(401);
    expect((await call(me, { cookie: `${SESSION_COOKIE}=garbage` })).status).toBe(401);
    const cookie = await cookieFor(f.a.STUDENT);
    await systemDb().session.updateMany({
      where: { userId: f.a.STUDENT.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await call(me, { cookie })).status).toBe(401);
  });

  it('stores only a hash of the session token', async () => {
    const r = await doLogin('student', f.a.STUDENT.login);
    const raw = setCookieValue(r.headers, SESSION_COOKIE)!;
    const rows = await systemDb().session.findMany({ where: { userId: f.a.STUDENT.id } });
    expect(rows.some((s) => s.tokenHash === raw)).toBe(false);
  });

  it('logout revokes the session server-side (spec §3.4)', async () => {
    const cookie = await cookieFor(f.a.STUDENT);
    const r = await call(logout, { method: 'POST', cookie });
    expect(r.status).toBe(200);
    expect(r.json.redirectTo).toBe('/login');
    expect((await call(me, { cookie })).status).toBe(401);
  });

  it('rejects cross-origin mutations', async () => {
    const cookie = await cookieFor(f.a.STUDENT);
    const r = await call(logout, {
      method: 'POST',
      cookie,
      headers: { origin: 'https://evil.example', host: 'localhost:3000' },
    });
    expect(r.status).toBe(403);
    expect((await call(me, { cookie })).status).toBe(200);
  });
});

describe('forced and voluntary password change', () => {
  it('blocks everything except change-password/me/logout while a change is pending', async () => {
    await systemDb().user.update({ where: { id: f.a.SCHOOL_ADMIN.id }, data: { mustChangePassword: true } });
    const r = await doLogin('staff', f.a.SCHOOL_ADMIN.login);
    expect(r.json.redirectTo).toBe('/change-password');
    const cookie = `${SESSION_COOKIE}=${setCookieValue(r.headers, SESSION_COOKIE)}`;
    const blocked = await call(listUsers, { cookie });
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call(me, { cookie })).status).toBe(200);
  });

  it('changing password revokes all other sessions and issues a new one', async () => {
    const other = await cookieFor(f.a.TEACHER);
    const current = await cookieFor(f.a.TEACHER);
    const r = await call(changePassword, {
      cookie: current,
      body: { currentPassword: PASSWORD, newPassword: 'Brand-new-pass-9' },
    });
    expect(r.status).toBe(200);
    expect((await call(me, { cookie: other })).status).toBe(401);
    expect((await call(me, { cookie: current })).status).toBe(401);
    const fresh = `${SESSION_COOKIE}=${setCookieValue(r.headers, SESSION_COOKIE)}`;
    expect((await call(me, { cookie: fresh })).status).toBe(200);
    expect((await doLogin('staff', f.a.TEACHER.login, 'Brand-new-pass-9')).status).toBe(200);
  });

  it('requires the correct current password and a strong, different new one', async () => {
    const cookie = await cookieFor(f.a.TEACHER);
    expect(
      (await call(changePassword, { cookie, body: { currentPassword: 'wrong-1', newPassword: 'Brand-new-pass-9' } }))
        .status,
    ).toBe(422);
    expect(
      (await call(changePassword, { cookie, body: { currentPassword: PASSWORD, newPassword: 'short' } })).status,
    ).toBe(422);
    expect(
      (await call(changePassword, { cookie, body: { currentPassword: PASSWORD, newPassword: PASSWORD } })).status,
    ).toBe(422);
  });
});

describe('email password reset (spec §3.5)', () => {
  function captureMail() {
    const sent: MailMessage[] = [];
    setMailer({ send: async (m) => void sent.push(m) });
    return sent;
  }
  const tokenFrom = (m: MailMessage) => decodeURIComponent(m.text.match(/token=([^\s]+)/)![1]!);

  it('sends a single-use link to email roles and resets the password', async () => {
    const sent = captureMail();
    const session = await cookieFor(f.a.PRINCIPAL);
    const r = await call(forgotPassword, { body: { email: 'principal@a.test', portal: 'staff' } });
    expect(r.status).toBe(200);
    expect(sent).toHaveLength(1);
    const token = tokenFrom(sent[0]!);
    expect((await call(resetPassword, { body: { token, newPassword: 'Reset-pass-77' } })).status).toBe(200);
    expect((await call(resetPassword, { body: { token, newPassword: 'Again-pass-77' } })).status).toBe(400);
    expect((await call(me, { cookie: session })).status).toBe(401);
    expect((await doLogin('staff', 'principal@a.test', 'Reset-pass-77')).status).toBe(200);
  });

  it('does not disclose whether an account exists, and never mails students/teachers', async () => {
    const sent = captureMail();
    const unknown = await call(forgotPassword, { body: { email: 'ghost@a.test', portal: 'staff' } });
    const known = await call(forgotPassword, { body: { email: 'admin@a.test', portal: 'staff' } });
    expect(unknown.json).toEqual(known.json);
    await systemDb().user.update({ where: { id: f.a.TEACHER.id }, data: { email: 'teacher@a.test' } });
    await call(forgotPassword, { body: { email: 'teacher@a.test', portal: 'staff' } });
    expect(sent.map((m) => m.to)).toEqual(['admin@a.test']);
  });

  it('rejects expired tokens', async () => {
    const sent = captureMail();
    await call(forgotPassword, { body: { email: 'admin@a.test', portal: 'staff' } });
    await systemDb().passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(
      (await call(resetPassword, { body: { token: tokenFrom(sent[0]!), newPassword: 'Reset-pass-77' } })).status,
    ).toBe(400);
  });
});

describe('scheduled endpoint', () => {
  it('requires the cron secret', async () => {
    expect((await call(cron)).status).toBe(401);
    expect((await call(cron, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
    const ok = await call(cron, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    expect(ok.status).toBe(200);
  });
});
