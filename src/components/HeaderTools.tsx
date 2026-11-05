'use client';

import { Bell, CornerDownLeft, FileText, GraduationCap, Search, Users, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/client/api';
import { cx } from '@/components/ui';

type Page = { href: string; label: string };
type Hit = { kind: 'page' | 'student' | 'teacher'; href: string; title: string; detail?: string };

// ── Search (Ctrl/⌘ K) ───────────────────────────────────────────────────────

/** Rendered twice (desktop sidebar + mobile bar); only the desktop one owns the Ctrl/⌘ K shortcut. */
export function SearchButton({ pages, compact = false }: { pages: Page[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (compact) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact]);
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <Search className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition hover:border-slate-300 hover:bg-white"
        >
          <Search className="size-4" aria-hidden />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400">
            Ctrl K
          </kbd>
        </button>
      )}
      {open && <SearchDialog pages={pages} onClose={() => setOpen(false)} />}
    </>
  );
}

type SearchResult = {
  students: {
    id: string;
    name: string;
    username: string | null;
    section: string;
    rollNumber: number | null;
    withdrawn: boolean;
  }[];
  teachers: { id: string; name: string; username: string | null }[];
};

function SearchDialog({ pages, onClose }: { pages: Page[]; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await api<SearchResult>(`/search?q=${encodeURIComponent(term)}`);
      setLoading(false);
      setData(r.ok ? r.data : { students: [], teachers: [] });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const hits: Hit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pageHits: Hit[] = (term ? pages.filter((p) => p.label.toLowerCase().includes(term)) : pages.slice(0, 6)).map(
      (p) => ({
        kind: 'page',
        href: p.href,
        title: p.label,
      }),
    );
    return [
      ...pageHits.slice(0, 5),
      ...(data?.students ?? []).map<Hit>((s) => ({
        kind: 'student',
        href: `/staff/students/${s.id}`,
        title: s.name,
        detail: `${s.section}${s.rollNumber ? ` · Roll ${s.rollNumber}` : ''} · ${s.username ?? ''}${s.withdrawn ? ' · withdrawn' : ''}`,
      })),
      ...(data?.teachers ?? []).map<Hit>((t) => ({
        kind: 'teacher',
        href: `/staff/teachers/${t.id}`,
        title: t.name,
        detail: t.username ?? 'Teacher',
      })),
    ];
  }, [q, data, pages]);

  useEffect(() => setActive(0), [hits.length]);
  const go = useCallback(
    (h: Hit | undefined) => {
      if (!h) return;
      onClose();
      router.push(h.href);
    },
    [onClose, router],
  );

  const ICON = { page: FileText, student: GraduationCap, teacher: Users };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') go(hits[active]);
        }}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="size-5 text-slate-400" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search students, teachers or pages"
            aria-label="Search students, teachers or pages"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {hits.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              <li key={`${h.kind}:${h.href}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                    i === active ? 'bg-[var(--accent)]/10' : '',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.title}</span>
                    {h.detail && <span className="block truncate text-xs text-slate-500">{h.detail}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="size-4 text-slate-400" aria-hidden />}
                </button>
              </li>
            );
          })}
          {q.trim().length >= 2 && !loading && data && !data.students.length && !data.teachers.length && (
            <li className="px-3 py-6 text-center text-sm text-slate-500">
              No students or teachers match “{q.trim()}”.
            </li>
          )}
          {loading && <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>}
        </ul>
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
          Search by name, username, admission number{q.replace(/\D/g, '').length >= 4 ? ' or guardian phone' : ''}. ↑↓
          to move, Enter to open.
        </p>
      </div>
    </div>
  );
}

// ── Notifications ───────────────────────────────────────────────────────────

type Note = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const r = await api<{ items: Note[]; unread: number }>('/notifications');
    if (r.ok) {
      setItems(r.data.items);
      setUnread(r.data.unread);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    await api('/notifications', { body: {} });
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  };
  const openOne = async (n: Note) => {
    setOpen(false);
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      await api('/notifications', { body: { ids: [n.id] } });
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] leading-4 font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-14 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-96 lg:right-auto lg:left-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="font-semibold">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {items.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">You’re all caught up.</li>
              )}
              {items.map((n) => {
                const content = (
                  <>
                    <span
                      className={cx(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-[var(--accent)]',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm', n.readAt ? 'text-slate-700' : 'font-semibold')}>
                        {n.title}
                      </span>
                      <span className="block text-sm text-slate-500">{n.body}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">{ago(n.createdAt)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => openOne(n)} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openOne(n)}
                        className="flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
