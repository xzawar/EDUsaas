import type { CSSProperties } from 'react';

export type PortalKey = 'student' | 'staff' | 'platform';

export const PORTAL_THEME: Record<PortalKey, { name: string; tagline: string; accent: string; panel: string }> = {
  student: {
    name: 'Student Portal',
    tagline: 'See your attendance, marks, timetable and announcements.',
    accent: '#4f46e5',
    panel: 'from-indigo-600 to-violet-700',
  },
  staff: {
    name: 'Staff Portal',
    tagline: 'For teachers, principals, admissions and school administrators.',
    accent: '#0f766e',
    panel: 'from-teal-700 to-emerald-800',
  },
  platform: {
    name: 'Platform Console',
    tagline: 'EDUsaas operations: schools, plans and system health.',
    accent: '#0f172a',
    panel: 'from-slate-800 to-slate-950',
  },
};

export const accentStyle = (portal: PortalKey) => ({ '--accent': PORTAL_THEME[portal].accent }) as CSSProperties;
