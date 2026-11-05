import { STATUS_STYLE } from '@/components/attendance/StatusPill';
import { cx } from '@/components/ui';

/** A month calendar of attendance; each day shows its status letter and colour (never colour alone). */
export function MonthCalendar({
  month,
  byDay,
  today,
}: {
  month: string;
  byDay: Record<string, string>;
  today: string;
}) {
  const first = new Date(`${month}-01T00:00:00Z`);
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`x${i}`} />;
          const st = byDay[d];
          const s = st ? STATUS_STYLE[st] : null;
          return (
            <div
              key={d}
              title={s ? `${d}: ${s.label}` : d}
              className={cx(
                'flex aspect-square flex-col items-center justify-center rounded-lg text-sm ring-1',
                s ? s.cls : 'bg-white text-slate-400 ring-slate-100',
                d === today && 'ring-2 ring-[var(--accent)]',
              )}
            >
              <span className="tabular-nums">{Number(d.slice(8))}</span>
              {s && <span className="text-[10px] font-semibold">{s.short}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
