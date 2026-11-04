import { describe, expect, it } from 'vitest';
import { scrub } from '@/server/audit/audit';
import { generateTemporaryPassword, newPasswordSchema } from '@/server/auth/password';
import { isSameOrigin, readCookie } from '@/server/http/request';
import { PORTAL_ROLES, portalForRole } from '@/server/auth/portals';

describe('audit scrubbing (spec §9.7)', () => {
  it('redacts secret-looking keys at any depth', () => {
    expect(
      scrub({ name: 'x', password: 'p', nested: { resetToken: 't', ok: 1 }, list: [{ passwordHash: 'h' }] }),
    ).toEqual({
      name: 'x',
      password: '[redacted]',
      nested: { resetToken: '[redacted]', ok: 1 },
      list: [{ passwordHash: '[redacted]' }],
    });
  });
});

describe('passwords', () => {
  it('temporary passwords always satisfy the policy', () => {
    for (let i = 0; i < 200; i++) expect(newPasswordSchema.safeParse(generateTemporaryPassword()).success).toBe(true);
  });
  it.each(['short1', 'onlyletters', '12345678'])('rejects weak password %s', (p) => {
    expect(newPasswordSchema.safeParse(p).success).toBe(false);
  });
});

describe('portals (decision D1)', () => {
  it('every role belongs to exactly one portal', () => {
    const roles = Object.values(PORTAL_ROLES).flat();
    expect(new Set(roles).size).toBe(roles.length);
    expect(roles).toHaveLength(7);
  });
  it('students and staff are on different portals', () => {
    expect(portalForRole('STUDENT')).toBe('STUDENT');
    expect(portalForRole('TEACHER')).toBe('STAFF');
    expect(portalForRole('SCHOOL_ADMIN')).toBe('STAFF');
    expect(portalForRole('PLATFORM_OWNER')).toBe('PLATFORM');
  });
});

describe('request helpers', () => {
  const req = (h: Record<string, string>) => new Request('http://localhost:3000/x', { headers: h });
  it('reads cookies', () => {
    expect(readCookie(req({ cookie: 'a=1; edu_session=abc%3D; b=2' }), 'edu_session')).toBe('abc=');
    expect(readCookie(req({}), 'edu_session')).toBeUndefined();
  });
  it('rejects cross-origin mutations', () => {
    expect(
      isSameOrigin(req({ origin: 'http://localhost:3000', host: 'localhost:3000' }), 'http://localhost:3000'),
    ).toBe(true);
    expect(isSameOrigin(req({ origin: 'https://evil.example', host: 'localhost:3000' }), 'http://localhost:3000')).toBe(
      false,
    );
    expect(isSameOrigin(req({}), 'http://localhost:3000')).toBe(true);
  });
});
