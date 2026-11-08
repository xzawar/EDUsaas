/** Groups a student's day-by-day register into school weeks (Monday start) with an attendance % per week. */
export function weeklyAttendance(byDay: Record<string, string>, maxWeeks = 14) {
  const weeks = new Map<string, { attended: number; considered: number; days: number }>();
  for (const [day, status] of Object.entries(byDay)) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const key = d.toISOString().slice(0, 10);
    const w = weeks.get(key) ?? { attended: 0, considered: 0, days: 0 };
    w.days++;
    if (status === 'PRESENT' || status === 'LATE') w.attended++;
    if (status === 'PRESENT' || status === 'LATE' || status === 'ABSENT') w.considered++;
    weeks.set(key, w);
  }
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, w]) => w.considered > 0)
    .slice(-maxWeeks)
    .map(([start, w]) => ({
      label: fmt(start),
      value: Math.round((w.attended / w.considered) * 1000) / 10,
      detail: `Week of ${fmt(start)} · ${w.attended}/${w.considered} days`,
    }));
}
