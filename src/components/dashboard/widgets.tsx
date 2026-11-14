import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Dashboard building blocks. Flat and calm: every tile shares the neutral tint, numbers are big and dark, and colour
 * is kept for meaning (the one main action, positive/negative values). Tones are kept as names so pages can still
 * vary tiles, but they all render the same quiet surface.
 */

export type Tone = 'violet' | 'pink' | 'sky' | 'mint' | 'amber';

const NEUTRAL = { card: 'bg-tint', ring: '#1c1259', track: '#e2e0ea', chip: 'bg-white text-deep' };
export const TONES: Record<Tone, { card: string; ring: string; track: string; chip: string }> = {
  violet: NEUTRAL,
  pink: NEUTRAL,
  sky: NEUTRAL,
  mint: NEUTRAL,
  amber: NEUTRAL,
};
export const TONE_ORDER: Tone[] = ['violet', 'pink', 'sky', 'mint', 'amber'];

/** Circular progress (0–100). The value is printed in the middle. */
export function Ring({
  value,
  tone,
  size = 56,
  label,
}: {
  value: number | null;
  tone: Tone;
  size?: number;
  label?: string;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? (value === null ? 'No data' : `${value}%`)}
      className="shrink-0"
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="white" stroke={TONES[tone].track} strokeWidth={5} />
      {value !== null && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONES[tone].ring}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-primary text-[12px] font-semibold"
      >
        {value === null ? '—' : `${Math.round(v)}%`}
      </text>
    </svg>
  );
}

/** A pastel KPI tile: optional ring, a headline, and a small caption. Whole tile is a link when `href` is set. */
export function PastelStat({
  tone,
  title,
  value,
  ring,
  caption,
  href,
  icon,
}: {
  tone: Tone;
  title: string;
  value?: ReactNode;
  ring?: number | null;
  caption?: ReactNode;
  href?: string;
  icon?: ReactNode;
}) {
  const body = (
    <>
      {ring !== undefined ? (
        <Ring value={ring} tone={tone} size={52} label={`${title}: ${ring === null ? 'no data' : `${ring}%`}`} />
      ) : icon ? (
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-deep [&_svg]:size-5">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        {value !== undefined ? (
          <>
            <p className="truncate text-sm text-secondary">{title}</p>
            <p className="mt-0.5 text-[22px] leading-7 font-semibold tracking-[-0.018em] text-primary tabular-nums">
              {value}
            </p>
          </>
        ) : (
          <p className="text-base leading-6 font-semibold tracking-[-0.011em] text-primary">{title}</p>
        )}
        {caption && <p className="mt-0.5 line-clamp-2 text-[13px] text-tertiary">{caption}</p>}
      </div>
      {href && (
        <ArrowUpRight
          className="ml-auto size-4 shrink-0 self-start text-tertiary transition group-hover:text-primary"
          aria-hidden
        />
      )}
    </>
  );
  const cls = cx(
    'group flex items-center gap-4 rounded-2xl px-5 py-5 transition-colors',
    TONES[tone].card,
    href && 'hover:bg-tint-strong',
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Tinted panel with a title row, used for every dashboard block. */
export function Panel({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('rounded-2xl bg-tint p-6', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="t-body-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-semibold text-link underline underline-offset-4 hover:text-deep-2">
      {children}
    </Link>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────

export type DayMark = 'absent' | 'late' | 'leave' | 'event';
const MARK: Record<DayMark, { dot: string; label: string }> = {
  absent: { dot: 'bg-negative', label: 'Absent' },
  late: { dot: 'bg-warning', label: 'Late' },
  leave: { dot: 'bg-deep-2', label: 'Leave' },
  event: { dot: 'bg-accent', label: 'Event' },
};

/** Month calendar (Monday first). Today is filled; marked days get a dot and a legend entry. */
export function MiniCalendar({
  today,
  marks = {},
  schoolDays = [1, 2, 3, 4, 5, 6],
}: {
  today: string;
  marks?: Record<string, DayMark>;
  schoolDays?: number[];
}) {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday = 0
  const title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const used = new Set(Object.values(marks));
  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-primary">{title}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d} className="pb-1 font-medium text-tertiary">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dow = ((lead + i) % 7) + 1; // 1 = Monday
          const isToday = iso === today;
          const mark = marks[iso];
          return (
            <span key={iso} className="flex flex-col items-center">
              <span
                className={cx(
                  'grid size-7 place-items-center rounded-full text-xs tabular-nums',
                  isToday
                    ? 'bg-accent font-semibold text-deep'
                    : schoolDays.includes(dow)
                      ? 'text-primary'
                      : 'text-disabled',
                )}
                aria-label={`${iso}${isToday ? ', today' : ''}${mark ? `, ${MARK[mark].label}` : ''}`}
              >
                {day}
              </span>
              <span
                className={cx('mt-0.5 size-1 rounded-full', mark ? MARK[mark].dot : 'bg-transparent')}
                aria-hidden
              />
            </span>
          );
        })}
      </div>
      {used.size > 0 && (
        <p className="mt-3 flex flex-wrap justify-center gap-3 text-xs text-tertiary">
          {[...used].map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className={cx('size-1.5 rounded-full', MARK[k].dot)} aria-hidden /> {MARK[k].label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ── Day timeline ────────────────────────────────────────────────────────────

type Lesson = {
  periodNo: number;
  startsAt: string;
  endsAt: string;
  isBreak: boolean;
  entry: { subject: string; teacher: string | null; section?: string; room: string | null } | null;
};

/** Today's schedule as a time rail with soft event cards; the current period gets a "Now" marker. */
export function DayTimeline({
  lessons,
  now,
  schoolDay,
  dayName,
  showSection,
}: {
  lessons: Lesson[];
  now: string;
  schoolDay: boolean;
  dayName: string;
  showSection?: boolean;
}) {
  if (!schoolDay)
    return <p className="py-6 text-center text-sm text-tertiary">No school today ({dayName}). Enjoy the day off.</p>;
  if (!lessons.some((l) => l.entry))
    return <p className="py-6 text-center text-sm text-tertiary">Nothing on your timetable today.</p>;
  return (
    <ol className="relative space-y-2">
      {lessons.map((l) => {
        const current = now >= l.startsAt && now < l.endsAt;
        const past = now >= l.endsAt;
        if (l.isBreak)
          return (
            <li key={l.periodNo} className="flex items-center gap-3 text-xs text-tertiary">
              <span className="w-10 text-right tabular-nums">{l.startsAt}</span>
              <span className="h-px flex-1 bg-line" />
              <span>Break</span>
            </li>
          );
        if (!l.entry) return null;
        return (
          <li key={l.periodNo} className={cx('flex gap-3', past && !current && 'opacity-55')}>
            <span className="w-10 pt-2.5 text-right text-xs text-tertiary tabular-nums">{l.startsAt}</span>
            <div
              className={cx('relative min-w-0 flex-1 rounded-xl bg-white px-3.5 py-2.5', current && 'ring-2 ring-deep')}
            >
              <p className="flex items-center gap-2 text-xs text-tertiary tabular-nums">
                {l.startsAt}–{l.endsAt}
                {current && (
                  <span className="rounded-full bg-accent px-2 text-[11px] font-semibold text-deep">Now</span>
                )}
              </p>
              <p className="truncate text-[15px] font-semibold text-primary">{l.entry.subject}</p>
              <p className="truncate text-[13px] text-secondary">
                {showSection && l.entry.section ? `Class ${l.entry.section}` : (l.entry.teacher ?? '')}
                {l.entry.room ? ` · Room ${l.entry.room}` : ''}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Dark "needs you" row item: a count and what it is, linking to where it's done. */
export function TodoItem({
  href,
  count,
  children,
  tone,
}: {
  href: string;
  count: number;
  children: ReactNode;
  tone: Tone;
}) {
  return (
    <Link
      href={href}
      className="group -mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white"
    >
      <span
        className={cx(
          'grid h-9 min-w-9 place-items-center rounded-full px-2.5 text-sm font-semibold tabular-nums',
          TONES[tone].chip,
        )}
      >
        {count}
      </span>
      <span className="min-w-0 flex-1 text-[15px] text-primary">{children}</span>
      <ArrowUpRight className="size-4 text-tertiary transition group-hover:text-primary" aria-hidden />
    </Link>
  );
}
