import type { CSSProperties } from 'react';

export type PortalKey = 'student' | 'staff' | 'platform';

export const PORTAL_THEME: Record<PortalKey, { name: string; tagline: string; accent: string; panel: string }> = {
  student: {
    name: 'Student Portal',
    tagline: 'See your attendance, marks, timetable and announcements.',
    accent: '#6c5ce7',
    panel: 'from-fuchsia-500 to-violet-600',
  },
  staff: {
    name: 'Staff Portal',
    tagline: 'For teachers, principals, admissions and school administrators.',
    accent: '#6c5ce7',
    panel: 'from-violet-600 to-indigo-700',
  },
  platform: {
    name: 'Platform Console',
    tagline: 'EDUsaas operations: schools, plans and system health.',
    accent: '#0f172a',
    panel: 'from-slate-800 to-slate-950',
  },
};

export const accentStyle = (portal: PortalKey) => ({ '--accent': PORTAL_THEME[portal].accent }) as CSSProperties;
