'use client';

import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  Clock,
  Plane,
  BarChart3,
  Bell,
  Megaphone,
  Upload,
  ScrollText,
  LifeBuoy,
  CalendarRange,
  ClipboardCheck,
  GraduationCap,
  Home,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  School,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/client/api';
import { clearQueue } from '@/client/offline';
import { Avatar, ROLE_LABELS, cx } from '@/components/ui';

const ICONS = {
  dashboard: LayoutDashboard,
  home: Home,
  students: GraduationCap,
  teachers: Users,
  staff: UserCog,
  structure: Layers,
  subjects: BookOpen,
  years: CalendarRange,
  promotion: ClipboardCheck,
  settings: Settings,
  schools: School,
  health: ShieldCheck,
  attendance: CalendarCheck,
  checkin: Clock,
  marks: ClipboardList,
  leave: Plane,
  timetable: CalendarClock,
  reports: BarChart3,
  notifications: Bell,
  announcements: Megaphone,
  import: Upload,
  audit: ScrollText,
  support: LifeBuoy,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-6">
      {groups.map((g, i) => (
        <div key={g.label ?? i}>
          {g.label && (
            <p className="mb-1.5 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">{g.label}</p>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    <Icon className="size-4.5 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserCard({ user }: { user: { displayName: string; role: string } }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-slate-200 p-3">
      <div className="flex items-center gap-3 px-2 py-2">
        <Avatar name={user.displayName} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.displayName}</p>
          <p className="truncate text-xs text-slate-500">{ROLE_LABELS[user.role] ?? user.role}</p>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <Link
          href="/change-password"
          className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <KeyRound className="size-3.5" aria-hidden /> Password
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await clearQueue().catch(() => undefined);
            const res = await api<{ redirectTo: string }>('/auth/logout', { method: 'POST' });
            window.location.assign(res.ok ? res.data.redirectTo : '/');
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          <LogOut className="size-3.5" aria-hidden /> {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

function Brand({ orgName }: { orgName: string }) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
        E
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-tight font-semibold">EDUsaas</p>
        <p className="truncate text-xs text-slate-500">{orgName}</p>
      </div>
    </div>
  );
}

export function Sidebar({
  groups,
  orgName,
  user,
  mobileTabs,
}: {
  groups: NavGroup[];
  orgName: string;
  user: { displayName: string; role: string };
  mobileTabs?: NavItem[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <Brand orgName={orgName} />
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList groups={groups} />
        </div>
        <UserCard user={user} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="size-5" />
        </button>
        <p className="truncate px-2 text-sm font-semibold">{orgName || 'EDUsaas'}</p>
        <Avatar name={user.displayName} size="sm" />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pr-3">
              <Brand orgName={orgName} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <UserCard user={user} />
          </aside>
        </div>
      )}

      {/* Mobile bottom tabs (teachers & students) */}
      {mobileTabs && mobileTabs.length > 1 && (
        <nav
          aria-label="Quick"
          className="fixed inset-x-0 bottom-0 z-20 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
          style={{ gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))` }}
        >
          {mobileTabs.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                  active ? 'text-[var(--accent)]' : 'text-slate-500',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
