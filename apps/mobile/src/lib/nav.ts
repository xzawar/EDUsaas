import type { Ionicons } from '@expo/vector-icons';
import type { Me } from './session';

export type Tab = { name: string; title: string; icon: keyof typeof Ionicons.glyphMap };

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
      return [
        { name: 'index', title: 'Today', icon: 'sunny-outline' },
        { name: 'attendance', title: 'Attendance', icon: 'checkbox-outline' },
        { name: 'marks', title: 'Marks', icon: 'ribbon-outline' },
        { name: 'leave', title: 'Leave', icon: 'airplane-outline' },
        more,
      ];
    case 'ACCOUNTANT':
      return [
        { name: 'index', title: 'Overview', icon: 'wallet-outline' },
        { name: 'collect', title: 'Collect', icon: 'cash-outline' },
        { name: 'invoices', title: 'Bills', icon: 'receipt-outline' },
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
    default: // SCHOOL_ADMIN, PRINCIPAL
      return [
        { name: 'index', title: 'Dashboard', icon: 'grid-outline' },
        { name: 'attendance', title: 'Attendance', icon: 'checkbox-outline' },
        ...(can('finance.read') ? [{ name: 'finance', title: 'Finance', icon: 'wallet-outline' } as Tab] : []),
        { name: 'students', title: 'People', icon: 'people-outline' },
        more,
      ];
  }
}

export type MoreItem = { href: string; title: string; icon: keyof typeof Ionicons.glyphMap; subtitle?: string };

/** The "More" sheet: everything not worth a tab. */
export function moreFor(me: Me): MoreItem[] {
  const can = (p: string) => me.permissions.includes(p);
  const role = me.user.role;
  const items: MoreItem[] = [];
  const add = (cond: boolean, item: MoreItem) => cond && items.push(item);
  add(role === 'STUDENT' || can('timetable.view'), {
    href: '/(app)/more/timetable',
    title: 'Timetable',
    icon: 'time-outline',
  });
  add(role === 'STUDENT' || can('leave.apply') || can('leave.approve'), {
    href: '/(app)/leave',
    title: 'Leave',
    icon: 'airplane-outline',
  });
  add(role !== 'PLATFORM_OWNER' && role !== 'PLATFORM_ADMIN', {
    href: '/(app)/announcements',
    title: 'Announcements',
    icon: 'megaphone-outline',
  });
  add(role === 'STUDENT', { href: '/(app)/more/report-card', title: 'Report card', icon: 'document-text-outline' });
  add(role === 'TEACHER', { href: '/(app)/students', title: 'My students', icon: 'school-outline' });
  add(can('marks.manage') || can('reports.read'), {
    href: '/(app)/marks',
    title: 'Tests & marks',
    icon: 'ribbon-outline',
  });
  add(can('fees.collect'), { href: '/(app)/collect', title: 'Collect fees', icon: 'cash-outline' });
  add(can('fees.collect'), { href: '/(app)/invoices', title: 'Fee bills', icon: 'receipt-outline' });
  add(can('fees.collect'), { href: '/(app)/claims', title: 'Payment proofs', icon: 'checkmark-done-outline' });
  add(can('expenses.manage') || can('finance.read'), {
    href: '/(app)/more/expenses',
    title: 'Expenses',
    icon: 'bag-outline',
  });
  add(can('payroll.manage') || can('finance.read'), {
    href: '/(app)/more/payroll',
    title: 'Payroll',
    icon: 'card-outline',
  });
  add(can('finance.read'), { href: '/(app)/more/reports', title: 'Money reports', icon: 'stats-chart-outline' });
  add(
    role !== 'STUDENT' &&
      role !== 'PLATFORM_OWNER' &&
      role !== 'PLATFORM_ADMIN' &&
      role !== 'ACCOUNTANT' &&
      role !== 'SCHOOL_ADMIN',
    { href: '/(app)/more/payslips', title: 'My payslips', icon: 'document-outline' },
  );
  add(can('teacher_attendance.oversee'), {
    href: '/(app)/more/checkins',
    title: 'Teacher check-ins',
    icon: 'finger-print-outline',
  });
  add(can('platform.plans.manage'), { href: '/(app)/more/plans', title: 'Plans', icon: 'pricetags-outline' });
  add(can('platform.admins.manage'), { href: '/(app)/more/admins', title: 'Platform admins', icon: 'shield-outline' });
  items.push({ href: '/(app)/more/notifications', title: 'Notifications', icon: 'notifications-outline' });
  items.push({
    href: '/(app)/more/queue',
    title: 'Waiting to send',
    icon: 'cloud-upload-outline',
    subtitle: 'Things saved offline',
  });
  items.push({ href: '/change-password', title: 'Change password', icon: 'key-outline' });
  return items;
}
