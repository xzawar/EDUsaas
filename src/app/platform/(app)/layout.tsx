import { AppShell } from '@/components/AppShell';
import type { NavItem } from '@/components/Sidebar';
import { requirePortal } from '@/server/auth/page';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePortal('PLATFORM');
  const items: NavItem[] = [{ href: '/platform', label: 'Schools', icon: 'schools', exact: true }];
  if (ctx.can('platform.support.queue') || ctx.can('platform.support.access') || ctx.can('platform.tenants.manage'))
    items.push({ href: '/platform/support', label: 'Support', icon: 'support' });
  if (ctx.can('platform.plans.manage')) items.push({ href: '/platform/plans', label: 'Plans', icon: 'reports' });
  if (ctx.can('platform.admins.manage'))
    items.push({ href: '/platform/admins', label: 'Platform admins', icon: 'staff' });
  if (ctx.can('platform.audit.read')) items.push({ href: '/platform/audit', label: 'Audit log', icon: 'audit' });
  return (
    <AppShell portal="platform" orgName="Platform console" user={ctx.user} nav={[{ items }]}>
      {children}
    </AppShell>
  );
}
