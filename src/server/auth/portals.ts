import type { Portal, UserRole } from '@prisma/client';

/**
 * Separate sign-in portals (decision D1). A portal can only NARROW who may sign in; it never grants anything.
 * The same generic error is returned when a valid account is used on the wrong portal.
 */
export const PORTAL_ROLES: Record<Portal, readonly UserRole[]> = {
  STUDENT: ['STUDENT'],
  STAFF: ['SCHOOL_ADMIN', 'PRINCIPAL', 'ADMISSIONS_OFFICER', 'ACCOUNTANT', 'TEACHER'],
  PLATFORM: ['PLATFORM_OWNER', 'PLATFORM_ADMIN'],
};

export const PORTAL_HOME: Record<Portal, string> = {
  STUDENT: '/student',
  STAFF: '/staff',
  PLATFORM: '/platform',
};

export const PORTAL_LOGIN: Record<Portal, string> = {
  STUDENT: '/login',
  STAFF: '/staff/login',
  PLATFORM: '/platform/login',
};

export const PORTAL_SLUGS = { student: 'STUDENT', staff: 'STAFF', platform: 'PLATFORM' } as const satisfies Record<
  string,
  Portal
>;
export type PortalSlug = keyof typeof PORTAL_SLUGS;

export function portalForRole(role: UserRole): Portal {
  for (const [portal, roles] of Object.entries(PORTAL_ROLES) as [Portal, readonly UserRole[]][]) {
    if (roles.includes(role)) return portal;
  }
  throw new Error(`No portal for role ${role}`);
}

/** Roles that sign in with email (and can use email password reset). Students/Teachers use usernames (spec §3.1). */
export const EMAIL_ROLES: readonly UserRole[] = [
  'SCHOOL_ADMIN',
  'PRINCIPAL',
  'ADMISSIONS_OFFICER',
  'ACCOUNTANT',
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
];
