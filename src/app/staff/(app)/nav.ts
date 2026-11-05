import type { NavGroup, NavItem } from '@/components/Sidebar';
import type { AuthedContext } from '@/server/http/route';

/**
 * Staff sidebar (decision D10). Items mirror permissions for convenience only; every page and API
 * re-checks permissions on the server.
 */
export function staffNav(ctx: AuthedContext): { groups: NavGroup[]; mobileTabs?: NavItem[] } {
  const isTeacher = ctx.user.role === 'TEACHER';
  const groups: NavGroup[] = [
    { items: [{ href: '/staff', label: isTeacher ? 'Today' : 'Dashboard', icon: 'dashboard', exact: true }] },
  ];

  const daily: NavItem[] = [];
  if (ctx.can('attendance.submit') || ctx.can('attendance.oversee'))
    daily.push({ href: '/staff/attendance', label: 'Attendance', icon: 'attendance' });
  if (ctx.can('teacher_attendance.oversee'))
    daily.push({ href: '/staff/teacher-attendance', label: 'Teacher check-ins', icon: 'checkin' });
  if (ctx.can('marks.enter') || ctx.can('marks.manage') || ctx.can('reports.read') || ctx.user.role === 'SCHOOL_ADMIN')
    daily.push({ href: '/staff/assessments', label: 'Tests & marks', icon: 'marks' });
  if (ctx.can('leave.apply') || ctx.can('leave.approve'))
    daily.push({ href: '/staff/leave', label: 'Leave', icon: 'leave' });
  if (ctx.can('timetable.view') || ctx.can('timetable.manage'))
    daily.push({ href: '/staff/timetable', label: 'Timetable', icon: 'timetable' });
  if (daily.length) groups.push({ label: 'Daily', items: daily });

  const people: NavItem[] = [];
  if (ctx.can('students.search'))
    people.push({ href: '/staff/students', label: isTeacher ? 'My students' : 'Students', icon: 'students' });
  if (ctx.can('teachers.read')) people.push({ href: '/staff/teachers', label: 'Teachers', icon: 'teachers' });
  if (ctx.can('users.read')) people.push({ href: '/staff/users', label: 'Staff accounts', icon: 'staff' });
  if (people.length) groups.push({ label: 'People', items: people });

  const academics: NavItem[] = [];
  if (ctx.can('structure.manage')) {
    academics.push({ href: '/staff/academics', label: 'Classes & sections', icon: 'structure' });
    academics.push({ href: '/staff/subjects', label: 'Subjects', icon: 'subjects' });
  }
  if (ctx.can('promotion.run')) academics.push({ href: '/staff/promotion', label: 'Promotion', icon: 'promotion' });
  if (academics.length) groups.push({ label: 'Academics', items: academics });

  if (ctx.can('settings.manage'))
    groups.push({ label: 'School', items: [{ href: '/staff/settings', label: 'Settings', icon: 'settings' }] });

  const mobileTabs = isTeacher
    ? ([
        { href: '/staff', label: 'Today', icon: 'dashboard', exact: true },
        { href: '/staff/attendance', label: 'Attendance', icon: 'attendance' },
        { href: '/staff/assessments', label: 'Marks', icon: 'marks' },
        { href: '/staff/timetable', label: 'Timetable', icon: 'timetable' },
        { href: '/staff/students', label: 'Students', icon: 'students' },
      ] satisfies NavItem[])
    : undefined;
  return { groups, mobileTabs };
}
