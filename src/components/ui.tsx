import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TdHTMLAttributes,
  TextareaHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-ghost' | 'ghost';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' ? 'px-4 py-2' : 'px-2.5 py-1.5 text-xs',
        variant === 'primary' &&
          'bg-[var(--accent)] text-white hover:brightness-110 focus-visible:ring-[var(--accent)]',
        variant === 'secondary' &&
          'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400',
        variant === 'danger-ghost' && 'text-red-700 hover:bg-red-50 focus-visible:ring-red-400',
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none',
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none',
        className,
      )}
    />
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-lg border px-3 py-2 text-sm',
        tone === 'error' && 'border-red-200 bg-red-50 text-red-800',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
        tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-800',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'slate' && 'bg-slate-100 text-slate-700',
        tone === 'green' && 'bg-emerald-100 text-emerald-800',
        tone === 'amber' && 'bg-amber-100 text-amber-800',
        tone === 'red' && 'bg-red-100 text-red-700',
        tone === 'blue' && 'bg-sky-100 text-sky-800',
      )}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_OWNER: 'Platform Owner',
  PLATFORM_ADMIN: 'Platform Admin',
  SCHOOL_ADMIN: 'School Admin',
  PRINCIPAL: 'Principal',
  ADMISSIONS_OFFICER: 'Admissions Officer',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 focus:outline-none',
        className,
      )}
    />
  );
}

/** Link styled as a button (for navigation actions). */
export function ButtonLink({
  href,
  variant = 'primary',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        variant === 'primary' &&
          'bg-[var(--accent)] text-white hover:brightness-110 focus-visible:ring-[var(--accent)]',
        variant === 'secondary' && 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('-mx-5 overflow-x-auto px-5', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cx(
        'border-b border-slate-200 py-2 pr-4 text-xs font-medium tracking-wide text-slate-500 uppercase',
        className,
      )}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cx('border-b border-slate-100 py-2.5 pr-4 align-middle', className)} />;
}

// ── Feedback & identity ─────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {icon && (
        <div className="mb-3 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">{icon}</div>
      )}
      <p className="font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold',
        AVATAR_COLORS[h % AVATAR_COLORS.length],
        size === 'sm' && 'size-7 text-xs',
        size === 'md' && 'size-9 text-sm',
        size === 'lg' && 'size-16 text-xl',
      )}
    >
      {initials || '?'}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

// ── Navigation helpers ──────────────────────────────────────────────────────

export function TabLinks({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; key: string; count?: number }[];
  active: string;
}) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={cx(
            'border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
            t.key === active
              ? 'border-[var(--accent)] text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Cursor pagination: "Previous" goes back to the first page (cursors are forward-only). */
export function Pager({
  nextHref,
  firstHref,
  showing,
}: {
  nextHref?: string | null;
  firstHref?: string | null;
  showing: string;
}) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>{showing}</span>
      <div className="flex gap-2">
        {firstHref && (
          <Link
            href={firstHref}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            First page
          </Link>
        )}
        {nextHref && (
          <Link
            href={nextHref}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-slate-500">{k}</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Formats a digits-only phone for display, e.g. 03001234567 → 0300 1234567. */
export function formatPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  if (/^03\d{9}$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4)}`;
  if (/^\+923\d{9}$/.test(p)) return `+92 ${p.slice(3, 6)} ${p.slice(6)}`;
  return p;
}
