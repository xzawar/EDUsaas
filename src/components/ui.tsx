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

/** Button styles, shared with ButtonLink. Pills; the accent fill is reserved for the one main action on a screen. */
export const buttonClass = (
  variant: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'danger-ghost' | 'ghost' = 'primary',
  size: 'sm' | 'md' | 'lg' = 'md',
) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.011em] whitespace-nowrap transition-colors duration-200 ease-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-deep focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    size === 'lg' && 'h-12 px-6 text-base',
    size === 'md' && 'h-10 px-5 text-[15px]',
    size === 'sm' && 'h-8 px-3.5 text-[13px]',
    variant === 'primary' && 'bg-accent text-deep hover:bg-[#9b8bff]',
    variant === 'secondary' && 'bg-tint text-primary hover:bg-tint-strong',
    variant === 'tertiary' && 'text-link underline underline-offset-4 hover:bg-tint',
    variant === 'ghost' && 'text-secondary hover:bg-tint hover:text-primary',
    variant === 'danger' && 'bg-negative text-white hover:bg-red-800',
    variant === 'danger-ghost' && 'bg-tint text-negative hover:bg-tint-strong',
  );

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'danger-ghost' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

const fieldClass =
  'block w-full rounded-md border border-line bg-white px-3.5 text-[15px] text-primary placeholder:text-disabled transition-colors focus:border-deep focus:ring-2 focus:ring-deep/15 focus:outline-none disabled:bg-tint disabled:text-tertiary';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, 'h-11', className)} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldClass, 'h-11 pr-8', className)} />;
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
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm text-secondary">
        {label}
      </label>
      {children}
      {hint && <p className="text-[13px] text-tertiary">{hint}</p>}
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
    <section className={cx('rounded-2xl bg-tint', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6">
          <div>
            {title && <h2 className="t-body-title">{title}</h2>}
            {description && <p className="mt-2 t-body">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="px-6 pt-4 pb-6">{children}</div>
    </section>
  );
}

/** Sentiment lives in the foreground: every alert shares the neutral tint; only the icon and text colour change. */
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
        'flex items-start gap-3 rounded-2xl bg-tint px-4 py-3.5 text-sm leading-[21.7px]',
        tone === 'error' && 'text-negative',
        tone === 'success' && 'text-positive',
        tone === 'info' && 'text-primary',
        tone === 'warning' && 'text-secondary',
      )}
    >
      <SentimentIcon tone={tone} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SentimentIcon({ tone }: { tone: 'error' | 'success' | 'info' | 'warning' }) {
  const fill = { error: '#b0261b', success: '#1e6b3a', info: '#1c1259', warning: '#edc843' }[tone];
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mt-px size-5 shrink-0">
      {tone === 'warning' ? (
        <path d="M12 2.5 22.5 21h-21L12 2.5Z" fill={fill} />
      ) : (
        <circle cx="12" cy="12" r="10" fill={fill} />
      )}
      {tone === 'success' ? (
        <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2" />
      ) : tone === 'info' ? (
        <path d="M12 10.5V17M12 7v.5" fill="none" stroke="#fff" strokeWidth="2" />
      ) : (
        <path
          d={tone === 'warning' ? 'M12 9v5.5M12 16.8v.5' : 'M12 6.5V13M12 16v.5'}
          fill="none"
          stroke={tone === 'warning' ? '#0f0e14' : '#fff'}
          strokeWidth="2"
        />
      )}
    </svg>
  );
}

/** Status pill. Neutral fill; the tone colours the text (and a dot for "waiting"). */
export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'strong';
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap',
        tone === 'strong' ? 'bg-negative text-white' : 'bg-tint-strong',
        tone === 'slate' && 'text-primary',
        tone === 'green' && 'text-positive',
        tone === 'amber' && 'text-secondary',
        tone === 'red' && 'text-negative',
        tone === 'blue' && 'text-deep',
      )}
    >
      {tone === 'amber' && <span aria-hidden className="size-1.5 rounded-full bg-warning" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-tint px-5 py-5">
      <p className="t-body">{label}</p>
      <p className="mt-2 text-[26px] leading-8 font-semibold tracking-[-0.02em] text-primary tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-[13px] text-tertiary">{hint}</p>}
    </div>
  );
}

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_OWNER: 'Platform Owner',
  PLATFORM_ADMIN: 'Platform Admin',
  SCHOOL_ADMIN: 'School Admin',
  PRINCIPAL: 'Principal',
  ADMISSIONS_OFFICER: 'Admissions Officer',
  ACCOUNTANT: 'Accountant',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldClass, 'py-3 leading-6', className)} />;
}

/** Link styled as a button (for navigation actions). */
/** Link styled as a button (for navigation actions). */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonClass(variant, size), className)}>
      {children}
    </Link>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('-mx-6 overflow-x-auto px-6', className)}>
      <table className="w-full text-left text-sm text-secondary">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={cx('border-b border-line py-2.5 pr-4 text-[13px] font-medium text-tertiary', className)}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={cx('border-b border-line py-3 pr-4 align-middle', className)} />;
}

// ── Feedback & identity ─────────────────────────────────────────────────────

/** Friendly, specific empty state: a picture, what will show here, and the one thing to do next. */
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
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-white text-deep ring-1 ring-line [&_svg]:size-7">
        {icon ?? (
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16v12H4zM4 7l2-3h12l2 3M9 11h6" />
          </svg>
        )}
      </div>
      <p className="t-body-title">{title}</p>
      {description && <p className="mt-2 max-w-sm t-body">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

// Avatars stay neutral (initials on the tint); colour is saved for meaning.
const AVATAR_COLORS = ['bg-tint text-primary ring-1 ring-line'];

export function Avatar({ name, size = 'md', src }: { name: string; size?: 'sm' | 'md' | 'lg'; src?: string | null }) {
  if (src)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small authenticated thumbnail served by our own API
      <img
        src={src}
        alt=""
        className={cx(
          'inline-block shrink-0 rounded-full object-cover',
          size === 'sm' && 'size-7',
          size === 'md' && 'size-9',
          size === 'lg' && 'size-16',
        )}
      />
    );
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
  return <div className={cx('animate-pulse rounded-md bg-tint', className)} />;
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
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? 'page' : undefined}
          className={cx(
            'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors',
            t.key === active ? 'bg-ink text-white' : 'bg-tint text-primary hover:bg-tint-strong',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cx('text-xs tabular-nums', t.key === active ? 'text-white/70' : 'text-tertiary')}>
              {t.count}
            </span>
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
    <div className="mt-4 flex items-center justify-between text-sm text-tertiary">
      <span>{showing}</span>
      <div className="flex gap-2">
        {firstHref && (
          <Link href={firstHref} className={buttonClass('secondary', 'sm')}>
            First page
          </Link>
        )}
        {nextHref && (
          <Link href={nextHref} className={buttonClass('secondary', 'sm')}>
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
          <dt className="text-tertiary">{k}</dt>
          <dd className="mt-1 font-semibold text-primary">{v ?? '—'}</dd>
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
