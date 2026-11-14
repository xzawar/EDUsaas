import type { PortalSlug } from '@edusaas/shared';

/**
 * Demo accounts for the hidden developer quick-sign-in (see the portal screen). These are the same public demo
 * logins printed in the repo README, and the quick-sign-in uses them through the normal sign-in flow, so the server
 * still checks the password. It is a convenience for testing a demo build, not an auth bypass: on a real school's
 * server these accounts do not exist, so the buttons simply fail. Never put a real account or secret here.
 */
export const DEMO_PASSWORD = 'Demo-pass-2026';

export type DemoLogin = { label: string; sub: string; portal: PortalSlug; identifier: string };

export const DEMO_LOGINS: DemoLogin[] = [
  { label: 'Student / parent', sub: 'Ahmad, 8-A', portal: 'student', identifier: 'bss-8a-ahmad-14' },
  { label: 'Teacher', sub: 'Ali Khan', portal: 'staff', identifier: 'bss-t-alikhan-1' },
  { label: 'School Admin', sub: 'admin@bss.test', portal: 'staff', identifier: 'admin@bss.test' },
  { label: 'Principal', sub: 'principal@bss.test', portal: 'staff', identifier: 'principal@bss.test' },
  { label: 'Accountant', sub: 'accounts@bss.test', portal: 'staff', identifier: 'accounts@bss.test' },
  { label: 'Admissions', sub: 'admissions@bss.test', portal: 'staff', identifier: 'admissions@bss.test' },
  { label: 'Platform Owner', sub: 'owner@edusaas.test', portal: 'platform', identifier: 'owner@edusaas.test' },
  { label: 'Platform Admin', sub: 'ops@edusaas.test', portal: 'platform', identifier: 'ops@edusaas.test' },
];
