import { cx } from '@/components/ui';

type Lesson = { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean; entry: { subject: string; teacher: string | null; section?: string; room: string | null } | null };

/** Today's lessons as a simple vertical list; the current period is highlighted. */
export function TodayLessons({ lessons, now, schoolDay, dayName, showSection }: { lessons: Lesson[]; now: string; schoolDay: boolean; dayName: string; showSection?: boolean }) {
  if (!schoolDay) return <p className="text-sm text-slate-500">No school today ({dayName}).</p>;
  if (!lessons.some((l) => l.entry)) return <p className="text-sm text-slate-500">No lessons on your timetable today.</p>;
  return (
    <ol className="space-y-1.5">
      {lessons.map((l) => {
        const current = now >= l.startsAt && now < l.endsAt;
        if (l.isBreak) return <li key={l.periodNo} className="px-3 text-xs text-slate-400">Break · {l.startsAt}</li>;
        return (
          <li key={l.periodNo} className={cx('flex items-center gap-3 rounded-lg px-3 py-2 ring-1', current ? 'bg-[var(--accent)]/10 ring-[var(--accent)]/30' : 'ring-slate-100')}>
            <span className="w-12 shrink-0 text-xs text-slate-500 tabular-nums">{l.startsAt}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.entry?.subject}</span>
              <span className="block truncate text-xs text-slate-500">{showSection ? `Class ${l.entry?.section ?? ''}` : (l.entry?.teacher ?? '')}{l.entry?.room ? ` · ${l.entry.room}` : ''}</span>
            </span>
            {current && <span className="text-xs font-semibold text-[var(--accent)]">Now</span>}
          </li>
        );
      })}
    </ol>
  );
}
