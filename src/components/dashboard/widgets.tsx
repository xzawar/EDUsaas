import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Dashboard building blocks in the soft "pastel card" style. Card tints are decoration (they separate tiles);
 * every number is also written as text, so colour never carries meaning on its own.
 */

export type Tone = 'violet' | 'pink' | 'sky' | 'mint' | 'amber';

export const TONES: Record<Tone, { card: string; ring: string; track: string; chip: string }> = {
  violet: {
    card: 'bg-[#ecebff]',
    ring: '#6c5ce7',
    track: 'rgba(108,92,231,0.16)',
    chip: 'bg-[#ecebff] text-[#4b3fc4]',
  },
  pink: { card: 'bg-[#fde7f3]', ring: '#d6479b', track: 'rgba(214,71,155,0.16)', chip: 'bg-[#fde7f3] text-[#a3236d]' },
  sky: { card: 'bg-[#dff0fd]', ring: '#2a86d1', track: 'rgba(42,134,209,0.16)', chip: 'bg-[#dff0fd] text-[#1d5f96]' },
  mint: { card: 'bg-[#dcf5ea]', ring: '#14966a', track: 'rgba(20,150,106,0.16)', chip: 'bg-[#dcf5ea] text-[#0d6b4b]' },
  amber: { card: 'bg-[#fdf0d5]', ring: '#c27c0e', track: 'rgba(194,124,14,0.18)', chip: 'bg-[#fdf0d5] text-[#8a560a]' },
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
        className="fill-slate-900 text-[11px] font-semibold"
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
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white text-slate-700">{icon}</span>
      ) : null}
      <div className="min-w-0">
        {caption && <p className="line-clamp-2 text-xs text-slate-600">{caption}</p>}
        <p className="text-base leading-tight font-semibold text-slate-900 2xl:text-lg">{title}</p>
        {value !== undefined && <p className="text-sm font-medium text-slate-700 tabular-nums">{value}</p>}
      </div>
      {href && (
        <ArrowUpRight
          className="ml-auto size-4 shrink-0 self-start text-slate-500 opacity-0 transition group-hover:opacity-100"
          aria-hidden
        />
      )}
    </>
  );
  const cls = cx(
    'group flex items-center gap-3.5 rounded-2xl px-4 py-5 transition',
    TONES[tone].card,
    href && 'hover:shadow-md',
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** White panel with a title row, used for every dashboard block. */
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
    <section
      id={id}
      className={cx(
        'rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]',
        className,
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-[var(--accent)] hover:underline">
      {children}
    </Link>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────

export type DayMark = 'absent' | 'late' | 'leave' | 'event';
const MARK: Record<DayMark, { dot: string; label: string }> = {
  absent: { dot: 'bg-rose-500', label: 'Absent' },
  late: { dot: 'bg-amber-500', label: 'Late' },
  leave: { dot: 'bg-sky-500', label: 'Leave' },
  event: { dot: 'bg-[var(--accent)]', label: 'Event' },
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
      <p className="mb-3 text-center text-sm font-semibold">{title}</p>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <span key={d} className="pb-1 font-medium text-slate-400">
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
                    ? 'bg-[var(--accent)] font-semibold text-white'
                    : schoolDays.includes(dow)
                      ? 'text-slate-700'
                      : 'text-rose-400',
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
        <p className="mt-3 flex flex-wrap justify-center gap-3 text-[11px] text-slate-500">
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

function toneFor(key: string): Tone {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONE_ORDER[h % TONE_ORDER.length]!;
}

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
  if (!schoolDay) return <p className="py-6 text-center text-sm text-slate-500">No school today ({dayName}).</p>;
  if (!lessons.some((l) => l.entry))
    return <p className="py-6 text-center text-sm text-slate-500">Nothing on your timetable today.</p>;
  return (
    <ol className="relative space-y-2">
      {lessons.map((l) => {
        const current = now >= l.startsAt && now < l.endsAt;
        const past = now >= l.endsAt;
        if (l.isBreak)
          return (
            <li key={l.periodNo} className="flex items-center gap-3 text-[11px] text-slate-400">
              <span className="w-10 text-right tabular-nums">{l.startsAt}</span>
              <span className="h-px flex-1 bg-slate-200" />
              <span>Break</span>
            </li>
          );
        if (!l.entry) return null;
        const tone = toneFor(l.entry.subject);
        return (
          <li key={l.periodNo} className={cx('flex gap-3', past && !current && 'opacity-55')}>
            <span className="w-10 pt-2 text-right text-[11px] text-slate-400 tabular-nums">{l.startsAt}</span>
            <div
              className={cx(
                'relative min-w-0 flex-1 rounded-xl px-3 py-2',
                TONES[tone].card,
                current && 'ring-2 ring-slate-900',
              )}
              style={{ borderLeft: `3px solid ${TONES[tone].ring}` }}
            >
              <p className="flex items-center gap-2 text-[11px] text-slate-600 tabular-nums">
                {l.startsAt}–{l.endsAt}
                {current && (
                  <span className="rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold text-white">Now</span>
                )}
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">{l.entry.subject}</p>
              <p className="truncate text-xs text-slate-600">
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
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
      <span
        className={cx(
          'grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-semibold tabular-nums',
          TONES[tone].chip,
        )}
      >
        {count}
      </span>
      <span className="min-w-0 flex-1 text-sm text-slate-700">{children}</span>
      <ArrowUpRight className="size-4 text-slate-400 transition group-hover:text-slate-700" aria-hidden />
    </Link>
  );
}
