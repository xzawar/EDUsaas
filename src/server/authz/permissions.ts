import type { UserRole } from '@prisma/client';

/**
 * Permission catalog (spec §2). Permissions are always checked server-side from the session's role +
 * the school's toggles. Teacher/Student permissions are fixed AND further scoped in services
 * (e.g. a teacher only reaches assigned sections), so holding a permission is necessary, not sufficient.
 */
export const PERMISSIONS = {
  // People
  'students.read': 'View student records',
  'students.search': 'Search students',
  'students.write': 'Add and edit students',
  'students.import': 'Bulk import students',
  'students.reset_password': 'Reset student passwords',
  'teachers.read': 'View teachers',
  'teachers.write': 'Add and edit teachers, assign subjects and sections',
  'users.read': 'View staff accounts',
  'users.manage': 'Create staff accounts and reset staff passwords',
  // Structure
  'structure.manage': 'Manage academic years, classes, sections and subjects',
  'promotion.run': 'Promote students',
  // Academic operations
  'attendance.submit': 'Mark attendance for assigned sections',
  'attendance.oversee': 'View and edit the full attendance grid',
  'teacher_attendance.self': 'Check in own teacher attendance',
  'teacher_attendance.oversee': 'View and correct teacher check-ins',
  'leave.apply': 'Apply for own leave',
  'leave.approve': 'Approve or reject leave',
  'marks.enter': 'Enter marks for assigned assessments',
  'marks.manage': 'Full access to marks, grades and remarks',
  'remarks.write': 'Add remarks',
  'timetable.view': 'View timetable',
  'timetable.manage': 'Manage timetable',
  // Management
  'reports.read': 'View reports and dashboards',
  'audit.read': 'View audit logs',
  'announcements.manage': 'Publish announcements',
  'settings.manage': 'Manage school settings and role permissions',
  'self.records': 'View own attendance, marks and timetable',
  'fees.manage': 'Set up fee heads, amounts and discounts',
  'fees.collect': 'Generate invoices, take payments, confirm payment proofs',
  'expenses.manage': 'Record school expenses',
  'payroll.manage': 'Salary structures and monthly payroll',
  'finance.read': 'View finance reports and ledgers',
  'self.fees': 'View own fee bills and submit payment proof',
  // Platform
  'platform.tenants.manage': 'Create, suspend and manage schools',
  'platform.tenants.read': 'Search schools by name and metadata',
  'platform.health.read': 'View system health',
  'platform.plans.manage': 'Manage plans and school subscriptions',
  'platform.admins.manage': 'Create Platform Admins and choose what they can do',
  'platform.audit.read': 'View the platform audit log',
  'platform.support.queue': 'Answer school support tickets',
  'platform.support.access': 'Ask for time-boxed support access to a school (Platform Owner approves)',
} as const;

/** What the Platform Owner can switch on for an individual Platform Admin (spec §2.7, §2.8). */
export const PLATFORM_ADMIN_GRANTABLE = [
  'platform.tenants.read',
  'platform.audit.read',
  'platform.support.queue',
  'platform.support.access',
] as const satisfies readonly Permission[];

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

type RolePolicy = {
  /** Always granted; not configurable. */
  fixed: Permission[];
  /** Toggleable per school by the School Admin. Value = default when the school hasn't set it. */
  configurable: Partial<Record<Permission, boolean>>;
};

const SCHOOL_ADMIN_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (p) =>
    !p.startsWith('platform.') &&
    p !== 'self.records' &&
    p !== 'self.fees' &&
    p !== 'teacher_attendance.self' &&
    p !== 'attendance.submit' &&
    p !== 'marks.enter',
);

export const ROLE_POLICIES: Record<UserRole, RolePolicy> = {
  PLATFORM_OWNER: {
    // No tenant-data permissions at all (spec §2.7, §9.6): tenant access only via break-glass support grants.
    fixed: [
      'platform.tenants.manage',
      'platform.tenants.read',
      'platform.health.read',
      'platform.plans.manage',
      'platform.admins.manage',
      'platform.audit.read',
      'platform.support.queue',
    ],
    configurable: {},
  },
  PLATFORM_ADMIN: {
    // Restricted operational seat; further scope granted explicitly by the Platform Owner (Phase 5).
    fixed: ['platform.health.read'],
    configurable: {},
  },
  SCHOOL_ADMIN: { fixed: SCHOOL_ADMIN_PERMISSIONS, configurable: {} },
  PRINCIPAL: {
    // Student search is granted by default regardless of toggles (spec §2.2).
    fixed: ['students.read', 'students.search', 'leave.apply', 'timetable.view'],
    configurable: {
      'students.write': false,
      'teachers.read': true,
      'users.read': true,
      'structure.manage': false,
      'promotion.run': false,
      'attendance.oversee': true,
      'teacher_attendance.oversee': true,
      'leave.approve': true,
      'marks.manage': false,
      'timetable.manage': false,
      'reports.read': true,
      'audit.read': true,
      'announcements.manage': true,
      'finance.read': true,
    },
  },
  ADMISSIONS_OFFICER: {
    fixed: ['students.read', 'students.search'],
    configurable: {
      'students.write': true,
      'students.import': true,
      'students.reset_password': true,
    },
  },
  ACCOUNTANT: {
    // Money only, plus finding a student at the counter. No attendance, marks, settings or accounts.
    fixed: [
      'fees.manage',
      'fees.collect',
      'expenses.manage',
      'payroll.manage',
      'finance.read',
      'students.read',
      'students.search',
    ],
    configurable: {},
  },
  TEACHER: {
    fixed: [
      'students.search',
      'attendance.submit',
      'teacher_attendance.self',
      'leave.apply',
      'marks.enter',
      'remarks.write',
      'timetable.view',
    ],
    configurable: {},
  },
  STUDENT: { fixed: ['self.records', 'self.fees', 'leave.apply', 'timetable.view'], configurable: {} },
};

export const CONFIGURABLE_ROLES = ['PRINCIPAL', 'ADMISSIONS_OFFICER'] as const satisfies readonly UserRole[];
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export function isConfigurable(role: UserRole, permission: string): permission is Permission {
  return Object.prototype.hasOwnProperty.call(ROLE_POLICIES[role].configurable, permission);
}

/** Effective permissions for a role given the school's overrides ({permission: granted}). */
export function effectivePermissions(
  role: UserRole,
  overrides: Partial<Record<string, boolean>> = {},
): Set<Permission> {
  const policy = ROLE_POLICIES[role];
  const result = new Set<Permission>(policy.fixed);
  for (const [perm, def] of Object.entries(policy.configurable) as [Permission, boolean][]) {
    const granted = overrides[perm] ?? def;
    if (granted) result.add(perm);
  }
  return result;
}
