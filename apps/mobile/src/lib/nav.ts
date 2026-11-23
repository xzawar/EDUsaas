import type { IconName } from '@/components/icon';
import type { Me } from './session';

export type Tab = { name: string; title: string; icon: IconName };

/**
 * Tabs per role (spec §3.4). The server still decides what each screen may load; this only picks the doors.
 * Route names map to files under app/(app)/.
 */
export function tabsFor(me: Me): Tab[] {
  const can = (p: string) => me.permissions.includes(p);
  const role = me.user.role;
  const more: Tab = { name: 'more', title: 'More', icon: 'ellipsis-horizontal-circle-outline' };
  switch (role) {
    case 'STUDENT':
      return [
        { name: 'index', title: 'Home', icon: 'home-outline' },
        { name: 'attendance', title: 'Attendance', icon: 'calendar-outline' },
        { name: 'marks', title: 'Marks', icon: 'ribbon-outline' },
        { name: 'fees', title: 'Fees', icon: 'receipt-outline' },
        more,
      ];
    case 'TEACHER':
      // The register is one tap from Today (only the first lecture's class), so it needs no tab of its own.
      return [
        { name: 'index', title: 'Today', icon: 'sunny-outline' },
        { name: 'marks', title: 'Tests', icon: 'ribbon-outline' },
        { name: 'students', title: 'My students', icon: 'people-outline' },
        { name: 'leave', title: 'Leave', icon: 'airplane-outline' },
        more,
      ];
    case 'ACCOUNTANT':
      return [
        // The counter in a pocket: today's money, taking a payment, checking proofs. Bills, payroll and setup are
        // done on the website.
        { name: 'index', title: 'Home', icon: 'home-outline' },
        { name: 'collect', title: 'Collect', icon: 'cash-outline' },
        { name: 'claims', title: 'Proofs', icon: 'checkmark-done-outline' },
        more,
      ];
    case 'CLERK':
      // Front office: the counter and the admissions desk in one seat.
      return [
        { name: 'index', title: 'Home', icon: 'home-outline' },
        { name: 'collect', title: 'Collect', icon: 'cash-outline' },
        { name: 'students', title: 'Students', icon: 'school-outline' },
        { name: 'claims', title: 'Proofs', icon: 'checkmark-done-outline' },
        more,
      ];
    case 'ADMISSIONS_OFFICER':
      return [
        { name: 'index', title: 'Home', icon: 'home-outline' },
        { name: 'students', title: 'Students', icon: 'school-outline' },
        { name: 'announcements', title: 'Notices', icon: 'megaphone-outline' },
        more,
      ];
    case 'PLATFORM_OWNER':
    case 'PLATFORM_ADMIN':
      return [
        { name: 'index', title: 'Overview', icon: 'planet-outline' },
        ...(can('platform.tenants.read')
          ? [{ name: 'schools', title: 'Schools', icon: 'business-outline' } as Tab]
          : []),
        ...(can('platform.support.queue')
          ? [{ name: 'tickets', title: 'Support', icon: 'help-buoy-outline' } as Tab]
          : []),
        more,
      ];
    default: // SCHOOL_ADMIN, PRINCIPAL (attendance lives in More; the principal has no money)
      return [
        { name: 'index', title: 'Dashboard', icon: 'home-outline' },
        { name: 'students', title: 'People', icon: 'people-outline' },
        ...(can('finance.read') ? [{ name: 'finance', title: 'Finance', icon: 'wallet-outline' } as Tab] : []),
        ...(!can('finance.read') && can('leave.approve')
          ? [{ name: 'leave', title: 'Leave', icon: 'airplane-outline' } as Tab]
          : []),
        more,
      ];
  }
}

export type MoreItem = { href: string; title: string; icon: IconName; subtitle?: string };

/**
 * The "More" list: only what is not already a tab, and only what this person uses on a phone. It never repeats a
 * tab, shows "Waiting to send" only when something is waiting, and leaves desk work (payroll, fee setup, bills
 * lists) to the website.
 */
export function moreFor(me: Me, opts: { pending?: number } = {}): MoreItem[] {
  const can = (p: string) => me.permissions.includes(p);
  const role = me.user.role;
  const tabs = new Set(tabsFor(me).map((t) => `/(app)/${t.name}`));
  const financeTab = tabs.has('/(app)/finance');
  const platform = role === 'PLATFORM_OWNER' || role === 'PLATFORM_ADMIN';
  const items: MoreItem[] = [];
  const add = (cond: boolean, item: MoreItem) => cond && items.push(item);

  // Registers, for everyone who takes or oversees them (no longer a tab).
  add(role !== 'STUDENT' && (can('attendance.oversee') || role === 'TEACHER'), {
    href: '/(app)/attendance',
    title: role === 'TEACHER' ? 'Registers' : 'Attendance',
    icon: 'checkbox-outline',
  });
  add(role === 'STUDENT' || can('timetable.view'), {
    href: '/(app)/more/timetable',
    title: 'Timetable',
    icon: 'time-outline',
  });
  add(role === 'STUDENT', { href: '/(app)/more/report-card', title: 'Report card', icon: 'document-text-outline' });
  add(role === 'STUDENT' || can('leave.apply') || can('leave.approve'), {
    href: '/(app)/leave',
    title: 'Leave',
    icon: 'airplane-outline',
  });
  add(role !== 'TEACHER' && (can('marks.manage') || can('reports.read')), {
    href: '/(app)/marks',
    title: 'Tests & marks',
    icon: 'ribbon-outline',
  });
  add(can('teacher_attendance.oversee'), {
    href: '/(app)/more/checkins',
    title: 'Teacher check-ins',
    icon: 'finger-print-outline',
  });
  // Money, for roles without a Finance tab (the Finance tab links to these itself).
  add(!financeTab && can('finance.read'), {
    href: '/(app)/more/reports',
    title: 'Who owes · reminders',
    icon: 'stats-chart-outline',
  });
  add(!financeTab && can('expenses.manage'), { href: '/(app)/more/expenses', title: 'Expenses', icon: 'bag-outline' });
  add(can('fees.manage'), { href: '/(app)/more/fee-setup', title: 'Set fees', icon: 'create-outline' });
  add(role === 'TEACHER' || role === 'PRINCIPAL' || role === 'ADMISSIONS_OFFICER' || role === 'CLERK', {
    href: '/(app)/more/payslips',
    title: 'My payslips',
    icon: 'document-outline',
  });
  add(can('platform.plans.manage'), { href: '/(app)/more/plans', title: 'Plans', icon: 'pricetags-outline' });
  add(can('platform.admins.manage'), { href: '/(app)/more/admins', title: 'Platform admins', icon: 'shield-outline' });
  const counter = role === 'ACCOUNTANT' || role === 'CLERK';
  add(!platform, { href: '/(app)/announcements', title: 'Notices', icon: 'megaphone-outline' });
  // The counter works from Home and Proofs; a notifications inbox is just noise there.
  add(!platform && !counter, {
    href: '/(app)/more/notifications',
    title: 'Notifications',
    icon: 'notifications-outline',
  });
  add(role === 'SCHOOL_ADMIN', { href: '/(app)/more/plan', title: 'Our plan', icon: 'pricetags-outline' });
  // Every staff seat can ask the EDUsaas team for help; students ask their school.
  add(!platform && role !== 'STUDENT', { href: '/(app)/more/support', title: 'Help', icon: 'help-buoy-outline' });
  add(platform && can('platform.health.read'), {
    href: '/(app)/more/stats',
    title: 'App health',
    icon: 'pulse-outline',
  });
  add(!!opts.pending, {
    href: '/(app)/more/queue',
    title: 'Waiting to send',
    icon: 'cloud-upload-outline',
    subtitle: `${opts.pending} saved on this phone`,
  });
  items.push({ href: '/change-password', title: 'Change password', icon: 'key-outline' });
  items.push({ href: '/(app)/more/about', title: 'About, privacy and terms', icon: 'information-circle-outline' });
  return items.filter((i) => !tabs.has(i.href));
}
