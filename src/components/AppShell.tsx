import type { ReactNode } from 'react';
import { OfflineSync } from '@/components/OfflineSync';
import { ToastProvider } from '@/components/overlay';
import { Sidebar, type NavGroup, type NavItem } from '@/components/Sidebar';
import { PORTAL_THEME, accentStyle, type PortalKey } from '@/components/portal-theme';
import { cx } from '@/components/ui';

export function AppShell({
  portal,
  orgName,
  user,
  nav,
  mobileTabs,
  tools,
  children,
}: {
  portal: PortalKey;
  orgName: string;
  user: {
    displayName: string;
    role: string;
    username?: string | null;
    email?: string | null;
    photoUrl?: string | null;
  };
  nav: NavGroup[];
  mobileTabs?: NavItem[];
  tools?: { search: boolean; notifications: boolean };
  children: ReactNode;
}) {
  return (
    <div style={accentStyle(portal)} className="min-h-screen">
      <ToastProvider>
        <OfflineSync />
        <Sidebar groups={nav} orgName={orgName} user={user} mobileTabs={mobileTabs} tools={tools} />
        <main
          aria-label={PORTAL_THEME[portal].name}
          className={cx(
            'lg:pl-64',
            tools && (tools.search || tools.notifications) ? 'lg:pt-16' : 'lg:pt-4',
            mobileTabs && mobileTabs.length > 1 ? 'pb-20 lg:pb-0' : '',
          )}
        >
          <div className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:px-6 lg:pt-2 lg:pb-8 xl:px-8">{children}</div>
        </main>
      </ToastProvider>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {breadcrumb && <div className="mb-2 text-sm text-slate-500">{breadcrumb}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
