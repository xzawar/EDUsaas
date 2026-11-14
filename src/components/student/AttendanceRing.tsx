/** Single-value donut (hero metric): one hue for the value, neutral track; the number is the label. */
export function AttendanceRing({
  pct,
  threshold,
  size = 120,
}: {
  pct: number | null;
  threshold: number;
  size?: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = pct ?? 0;
  const low = pct !== null && pct < threshold;
  return (
    <figure
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
      aria-label={pct === null ? 'No attendance recorded yet' : `Attendance ${pct}%`}
    >
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={low ? '#b0261b' : '#1c1259'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(v / 100) * c} ${c}`}
        />
      </svg>
      <figcaption className="text-center">
        <span className="block text-2xl font-semibold tabular-nums">{pct === null ? '—' : `${pct}%`}</span>
        <span className="block text-xs text-slate-500">attendance</span>
      </figcaption>
    </figure>
  );
}
