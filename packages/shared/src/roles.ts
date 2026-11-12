/** Role labels and the portal each role signs in on. Shared by the web app and the native app. */
export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_OWNER: 'Platform Owner',
  PLATFORM_ADMIN: 'Platform Admin',
  SCHOOL_ADMIN: 'School Admin',
  PRINCIPAL: 'Principal',
  ADMISSIONS_OFFICER: 'Admissions Officer',
  ACCOUNTANT: 'Accountant',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

export type PortalSlug = 'student' | 'staff' | 'platform';

export const PORTALS: { slug: PortalSlug; title: string; blurb: string; idLabel: string }[] = [
  { slug: 'student', title: 'Student / Parent', blurb: 'Attendance, marks, fees, timetable.', idLabel: 'Username' },
  { slug: 'staff', title: 'Staff', blurb: 'Teachers, office and school admin.', idLabel: 'Username or email' },
  { slug: 'platform', title: 'EDUsaas team', blurb: 'Platform console.', idLabel: 'Email' },
];
