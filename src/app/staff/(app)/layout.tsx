import { AppShell } from '@/components/AppShell';
import type { NavItem } from '@/components/NavLinks';
import { requirePortal } from '@/server/auth/page';

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('STAFF');
  // Navigation mirrors permissions for convenience only; every page and API checks permissions server-side.
  const nav: NavItem[] = [{ href: '/staff', label: 'Dashboard' }];
  if (ctx.can('users.read')) nav.push({ href: '/staff/users', label: 'People' });
  if (ctx.can('settings.manage')) nav.push({ href: '/staff/settings', label: 'Settings' });
  return (
    <AppShell portal="staff" homeHref="/staff" orgName={ctx.session.tenant?.name ?? ''} user={ctx.user} nav={nav}>
      {children}
    </AppShell>
  );
}
