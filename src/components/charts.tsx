import { cx } from '@/components/ui';

/**
 * Single-series horizontal bars (dataviz: one hue, no legend, value direct-labelled at the bar end,
 * thin 4px-rounded marks anchored at the baseline, 2px gap). Each row is focusable with a tooltip, and the
 * labelled rows double as the table view.
 */
export function BarList({
  rows,
  max,
  unit,
  caption,
}: {
  rows: { label: string; value: number; hint?: string; secondary?: number }[];
  max?: number;
  unit?: string;
  caption: string;
}) {
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => Math.max(r.value, r.secondary ?? 0))));
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-0.5">
        {rows.map((r) => {
          const pct = (r.value / top) * 100;
          const tip = `${r.label}: ${r.value}${unit ? ` ${unit}` : ''}${r.hint ? ` · ${r.hint}` : ''}`;
          return (
            <li
              key={r.label}
              tabIndex={0}
              title={tip}
              aria-label={tip}
              className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-deep/30"
            >
              <span className="truncate text-sm text-slate-600">{r.label}</span>
              <span className="relative h-2.5 rounded-r bg-slate-100">
                {r.secondary !== undefined && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-r border-r-2 border-slate-300"
                    style={{ width: `${Math.min(100, (r.secondary / top) * 100)}%` }}
                  />
                )}
                <span
                  className={cx(
                    'absolute inset-y-0 left-0 rounded-r bg-accent transition-opacity group-hover:opacity-80',
                  )}
                  style={{ width: `${Math.max(pct, r.value > 0 ? 1.5 : 0)}%` }}
                />
              </span>
              <span className="w-10 text-right text-sm font-medium tabular-nums text-slate-900">{r.value}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** A thin progress meter (e.g. setup completion, section fill). */
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="h-2 w-full rounded-full bg-slate-100"
    >
      <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Single-series daily columns (0–100%) with a dashed target line. One hue; values below target use the
 * "serious" status colour and are also listed in the tooltip, so colour is never the only signal.
 */
export function TrendColumns({
  points,
  target,
  caption,
}: {
  points: { day: string; pct: number }[];
  target: number;
  caption: string;
}) {
  if (!points.length)
    return <p className="text-sm text-slate-500">No attendance recorded in the last 30 school days.</p>;
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="relative h-36">
        <div
          className="absolute inset-x-0 border-t border-dashed border-slate-400"
          style={{ bottom: `${target}%` }}
          aria-hidden
        >
          <span className="absolute -top-4 right-0 text-[10px] text-slate-500">target {target}%</span>
        </div>
        <ul className="absolute inset-0 flex items-end gap-[2px]">
          {points.map((p) => (
            <li
              key={p.day}
              tabIndex={0}
              title={`${fmt(p.day)}: ${p.pct}%${p.pct < target ? ' (below target)' : ''}`}
              aria-label={`${fmt(p.day)}: ${p.pct}%`}
              className="group relative flex h-full flex-1 items-end outline-none"
            >
              <span
                className={cx(
                  'w-full rounded-t-[3px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-deep/30',
                  p.pct < target ? 'bg-red-600' : 'bg-accent',
                )}
                style={{ height: `${Math.max(p.pct, 1)}%` }}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">
        <span>{fmt(points[0]!.day)}</span>
        <span>{fmt(points[points.length - 1]!.day)}</span>
      </div>
    </figure>
  );
}
