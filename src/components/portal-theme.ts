import type { CSSProperties } from 'react';

export type PortalKey = 'student' | 'staff' | 'platform';

/**
 * Each portal's words. One brand for all three: the colour system lives in globals.css, so portals differ only in
 * what they say. `headline` is the short display line on the sign-in brand panel.
 */
export const PORTAL_THEME: Record<PortalKey, { name: string; headline: string; tagline: string }> = {
  student: {
    name: 'Student portal',
    headline: 'Your school day, in one place.',
    tagline: 'Attendance, marks, fees and your timetable.',
  },
  staff: {
    name: 'Staff portal',
    headline: 'Run your school, calmly.',
    tagline: 'For teachers, office staff, principals and school admins.',
  },
  platform: {
    name: 'Platform console',
    headline: 'Every school, one console.',
    tagline: 'Schools, plans, support and system health.',
  },
};

/** Kept for callers that set the accent per portal; every portal now shares the brand accent. */
export const accentStyle = (_portal: PortalKey) => ({}) as CSSProperties;
