import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/LogoutButton';
import { NavLinks, type NavItem } from '@/components/NavLinks';
import { PORTAL_THEME, accentStyle, type PortalKey } from '@/components/portal-theme';
import { ROLE_LABELS } from '@/components/ui';

export function AppShell({
  portal,
  homeHref,
  orgName,
  user,
  nav,
  children,
}: {
  portal: PortalKey;
  homeHref: string;
  orgName: string;
  user: { displayName: string; role: string };
  nav: NavItem[];
  children: ReactNode;
}) {
  const theme = PORTAL_THEME[portal];
  return (
    <div style={accentStyle(portal)} className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={homeHref} className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
                E
              </span>
              <span className="hidden font-semibold sm:inline">EDUsaas</span>
            </Link>
            <span className="truncate border-l border-slate-200 pl-3 text-sm text-slate-600">{orgName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.displayName}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <Link
              href="/change-password"
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Password
            </Link>
            <LogoutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <NavLinks items={nav} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8" aria-label={theme.name}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
