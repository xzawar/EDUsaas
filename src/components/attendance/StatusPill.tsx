import { cx } from '@/components/ui';

/** Status colours carry a letter + word, never colour alone (dataviz/status rule). */
export const STATUS_STYLE: Record<string, { short: string; label: string; cls: string }> = {
  PRESENT: { short: 'P', label: 'Present', cls: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  ABSENT: { short: 'A', label: 'Absent', cls: 'bg-red-100 text-red-800 ring-red-200' },
  LATE: { short: 'L', label: 'Late', cls: 'bg-amber-100 text-amber-900 ring-amber-200' },
  LEAVE: { short: 'LV', label: 'Leave', cls: 'bg-sky-100 text-sky-800 ring-sky-200' },
  EXCUSED: { short: 'E', label: 'Excused', cls: 'bg-slate-100 text-slate-700 ring-slate-200' },
};

export function StatusPill({ status, compact }: { status: string | null; compact?: boolean }) {
  if (!status) return <span className="text-slate-300">·</span>;
  const s = STATUS_STYLE[status]!;
  return (
    <span title={s.label} className={cx('inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1', s.cls, compact && 'min-w-6')}>
      {compact ? s.short : s.label}
    </span>
  );
}
