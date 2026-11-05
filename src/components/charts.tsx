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
              className="group grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-md px-1 py-1 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
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
                    'absolute inset-y-0 left-0 rounded-r bg-[var(--accent)] transition-opacity group-hover:opacity-80',
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
      <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
    </div>
  );
}
