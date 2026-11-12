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
  Wallet,
  HandCoins,
  Receipt,
  FileCheck,
  ShoppingBag,
  Banknote,
  FileSpreadsheet,
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
import { NotificationBell, SearchButton } from '@/components/HeaderTools';
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
  finance: Wallet,
  collect: HandCoins,
  invoices: Receipt,
  claims: FileCheck,
  expenses: ShoppingBag,
  payroll: Banknote,
  payslip: FileSpreadsheet,
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
    <nav aria-label="Main" className="space-y-3">
      {groups.map((g, i) => (
        <div key={g.label ?? i}>
          {g.label && (
            <p className="mb-0.5 px-4 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g.label}</p>
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
                      'flex items-center gap-3 rounded-xl px-4 py-1.5 text-sm transition',
                      active
                        ? 'bg-slate-900 font-semibold text-white shadow-sm'
                        : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
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

type SidebarUser = {
  displayName: string;
  role: string;
  username?: string | null;
  email?: string | null;
  photoUrl?: string | null;
};

/** Profile at the top of the sidebar: who is signed in, and where. Compact, so the whole menu fits on a laptop. */
function Profile({ user, orgName }: { user: SidebarUser; orgName: string }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-4">
      <Avatar name={user.displayName} size="md" src={user.photoUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{user.displayName}</p>
        {(user.username ?? user.email) && (
          <p className="truncate font-mono text-[11px] text-slate-500">{user.username ?? user.email}</p>
        )}
        <p className="truncate text-xs text-slate-500">
          {ROLE_LABELS[user.role] ?? user.role}
          {orgName ? ` · ${orgName}` : ''}
        </p>
      </div>
    </div>
  );
}

function FooterActions() {
  const [busy, setBusy] = useState(false);
  const row =
    'flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
  return (
    <div className="flex gap-1 border-t border-slate-100 px-3 pt-2 pb-3">
      <Link href="/change-password" className={row}>
        <KeyRound className="size-[18px]" aria-hidden /> Password
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
        className={cx(row, 'disabled:opacity-60')}
      >
        <LogOut className="size-[18px]" aria-hidden /> {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}

export function Sidebar({
  groups,
  orgName,
  user,
  mobileTabs,
  tools = { search: false, notifications: false },
}: {
  groups: NavGroup[];
  orgName: string;
  user: SidebarUser;
  mobileTabs?: NavItem[];
  /** Global search (Ctrl/⌘ K) and the notifications bell (desktop: in the top bar; mobile: in the header). */
  tools?: { search: boolean; notifications: boolean };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const pages = groups.flatMap((g) => g.items.map((i) => ({ href: i.href, label: i.label })));

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col bg-white lg:flex">
        <Profile user={user} orgName={orgName} />
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          <NavList groups={groups} />
        </div>
        <FooterActions />
      </aside>

      {/* Desktop top bar: search + notifications, top-right of the page */}
      {(tools.search || tools.notifications) && (
        <div className="fixed top-0 right-0 left-64 z-10 hidden h-16 items-center justify-end gap-2 bg-[#f4f4f8]/85 px-6 backdrop-blur lg:flex xl:px-8">
          {tools.search && (
            <div className="w-72">
              <SearchButton pages={pages} />
            </div>
          )}
          {tools.notifications && <NotificationBell />}
        </div>
      )}

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex items-center gap-1 bg-white/95 px-3 py-2 shadow-[0_1px_0_rgba(15,23,42,0.06)] backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Menu className="size-5" />
        </button>
        <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{orgName || 'EDUsaas'}</p>
        {tools.search && <SearchButton pages={pages} compact />}
        {tools.notifications && <NotificationBell />}
        {!tools.search && !tools.notifications && <Avatar name={user.displayName} size="sm" />}
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="-mt-4">
              <Profile user={user} orgName={orgName} />
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-2">
              <NavList groups={groups} onNavigate={() => setOpen(false)} />
            </div>
            <FooterActions />
          </aside>
        </div>
      )}

      {/* Mobile bottom tabs (teachers & students) */}
      {mobileTabs && mobileTabs.length > 1 && (
        <nav
          aria-label="Quick"
          className="fixed inset-x-0 bottom-0 z-20 grid bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_rgba(15,23,42,0.06)] lg:hidden"
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
                  active ? 'text-slate-900' : 'text-slate-400',
                )}
              >
                <span
                  className={cx(
                    'grid h-7 w-12 place-items-center rounded-full transition',
                    active && 'bg-slate-900 text-white',
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
