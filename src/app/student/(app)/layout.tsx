import { AppShell } from '@/components/AppShell';
import type { NavItem } from '@/components/Sidebar';
import { requirePortal } from '@/server/auth/page';

const STUDENT_NAV: NavItem[] = [
  { href: '/student', label: 'Home', icon: 'home', exact: true },
  { href: '/student/attendance', label: 'Attendance', icon: 'attendance' },
  { href: '/student/marks', label: 'Marks', icon: 'marks' },
  { href: '/student/timetable', label: 'Timetable', icon: 'timetable' },
  { href: '/student/leave', label: 'Leave', icon: 'leave' },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('STUDENT');
  return (
    <AppShell
      portal="student"
      orgName={ctx.session.tenant?.name ?? ''}
      user={ctx.user}
      nav={[{ items: STUDENT_NAV }]}
      mobileTabs={STUDENT_NAV}
      tools={{ search: false, notifications: true }}
    >
      {children}
    </AppShell>
  );
}
