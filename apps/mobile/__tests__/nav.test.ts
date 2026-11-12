import fs from 'node:fs';
import path from 'node:path';
import { moreFor, tabsFor } from '@/lib/nav';
import { mapLink } from '@/lib/links';
import type { Me } from '@/lib/session';

const APP = path.join(__dirname, '..', 'app', '(app)');
const exists = (route: string) => {
  const rel = route.replace('/(app)', '').replace(/^\//, '') || 'index';
  return (
    [`${rel}.tsx`, `${rel}/index.tsx`].some((f) => fs.existsSync(path.join(APP, f))) ||
    (route === '/change-password' && fs.existsSync(path.join(__dirname, '..', 'app', 'change-password.tsx')))
  );
};

// Mirrors src/server/authz/permissions.ts for the permissions the app looks at.
const PERMS: Record<string, string[]> = {
  STUDENT: ['self.records', 'timetable.view'],
  TEACHER: ['timetable.view', 'leave.apply', 'marks.manage', 'attendance.mark'],
  SCHOOL_ADMIN: [
    'timetable.view',
    'leave.approve',
    'marks.manage',
    'reports.read',
    'fees.collect',
    'fees.manage',
    'expenses.manage',
    'payroll.manage',
    'finance.read',
    'teacher_attendance.oversee',
    'attendance.oversee',
  ],
  PRINCIPAL: [
    'timetable.view',
    'leave.approve',
    'leave.apply',
    'reports.read',
    'finance.read',
    'teacher_attendance.oversee',
    'attendance.oversee',
  ],
  ADMISSIONS_OFFICER: ['students.read'],
  ACCOUNTANT: [
    'fees.manage',
    'fees.collect',
    'expenses.manage',
    'payroll.manage',
    'finance.read',
    'students.read',
    'students.search',
  ],
  PLATFORM_OWNER: [
    'platform.tenants.read',
    'platform.support.queue',
    'platform.plans.manage',
    'platform.admins.manage',
  ],
  PLATFORM_ADMIN: ['platform.tenants.read', 'platform.support.queue'],
};
const me = (role: string): Me => ({
  user: { id: 'u', role, displayName: 'Test User', username: null, email: null, mustChangePassword: false },
  portal: role === 'STUDENT' ? 'STUDENT' : role.startsWith('PLATFORM') ? 'PLATFORM' : 'STAFF',
  tenant: role.startsWith('PLATFORM') ? null : { id: 't', name: 'School', prefix: 'bss' },
  permissions: PERMS[role]!,
});

describe.each(Object.keys(PERMS))('%s navigation', (role) => {
  const tabs = tabsFor(me(role));
  const more = moreFor(me(role));
  it('has 3–5 tabs, Home first and More last', () => {
    expect(tabs.length).toBeGreaterThanOrEqual(3);
    expect(tabs.length).toBeLessThanOrEqual(5);
    expect(tabs[0]!.name).toBe('index');
    expect(tabs.at(-1)!.name).toBe('more');
  });
  it('every tab and More item opens a real screen', () => {
    for (const t of tabs) expect(exists(`/(app)/${t.name === 'index' ? '' : t.name}`)).toBe(true);
    for (const i of more) expect([i.href, exists(i.href)]).toEqual([i.href, true]);
  });
  it('has no duplicate menu entries', () => {
    expect(new Set(more.map((i) => i.href)).size).toBe(more.length);
  });
});

describe('role boundaries in the menu', () => {
  const hrefs = (role: string) => [
    ...tabsFor(me(role)).map((t) => `/(app)/${t.name}`),
    ...moreFor(me(role)).map((i) => i.href),
  ];
  it('students never see money tools or staff screens', () => {
    const h = hrefs('STUDENT');
    for (const x of [
      '/(app)/collect',
      '/(app)/invoices',
      '/(app)/claims',
      '/(app)/finance',
      '/(app)/more/payroll',
      '/(app)/more/expenses',
      '/(app)/students',
    ])
      expect(h).not.toContain(x);
    expect(h).toContain('/(app)/fees');
  });
  it('teachers do not see finance', () => {
    const h = hrefs('TEACHER');
    for (const x of ['/(app)/collect', '/(app)/finance', '/(app)/more/reports', '/(app)/more/payroll'])
      expect(h).not.toContain(x);
  });
  it('the accountant collects at the counter', () => {
    expect(tabsFor(me('ACCOUNTANT')).map((t) => t.name)).toEqual(['index', 'collect', 'invoices', 'claims', 'more']);
  });
  it('the principal reads finance but cannot collect', () => {
    const h = hrefs('PRINCIPAL');
    expect(h).toContain('/(app)/finance');
    expect(h).not.toContain('/(app)/collect');
  });
  it('platform admin without plan rights gets no Plans entry', () => {
    expect(hrefs('PLATFORM_ADMIN')).not.toContain('/(app)/more/plans');
    expect(hrefs('PLATFORM_OWNER')).toContain('/(app)/more/plans');
  });
});

describe('notification links', () => {
  it.each([
    ['/student/fees', '/(app)/fees'],
    ['/staff/finance/claims?x=1', '/(app)/claims'],
    ['/staff/payslips', '/(app)/more/payslips'],
    ['/student/marks', '/(app)/marks'],
    ['/staff/leave/approvals', '/(app)/leave'],
    ['/somewhere/else', '/(app)'],
  ])('%s opens %s', (link, route) => {
    expect(mapLink(link)).toBe(route);
    expect(exists(route)).toBe(true);
  });
});
