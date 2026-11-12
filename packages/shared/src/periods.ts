/**
 * Invoice and payroll periods (Finance spec §2.2): "YYYY-MM" for a month, "YYYY-T1|T2|T3" for a term,
 * "YYYY-ONCE-<feeHeadId>" for a one-time charge. Pure helpers shared with the mobile app.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const TERM_PERIOD = /^(\d{4})-T([1-3])$/;
export const ONCE_PERIOD = /^(\d{4})-ONCE-([0-9a-f-]{36})$/;

/** "2026-11-05" → "2026-11". */
export function monthPeriod(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** First and last day of a "YYYY-MM" period. */
export function monthBounds(period: string): { from: string; to: string } {
  const m = MONTH_PERIOD.exec(period);
  if (!m) throw new RangeError(`Not a month period: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

/** Next "YYYY-MM". */
export function nextMonth(period: string): string {
  const m = MONTH_PERIOD.exec(period);
  if (!m) throw new RangeError(`Not a month period: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Which term a calendar month belongs to, given the months each term starts (default [4, 9, 1] = April, September,
 * January). Terms wrap around the calendar year.
 */
export function termOf(month: number, termStartMonths: number[] = [4, 9, 1]): 1 | 2 | 3 {
  const starts = termStartMonths.slice(0, 3);
  // Walk terms in order; a month belongs to the latest term whose start is <= it, cyclically.
  let best: 1 | 2 | 3 = 1;
  let bestDistance = Infinity;
  starts.forEach((start, i) => {
    const distance = (month - start + 12) % 12; // months since this term started
    if (distance < bestDistance) {
      bestDistance = distance;
      best = (i + 1) as 1 | 2 | 3;
    }
  });
  return best;
}

/** True when `month` is the first month of a term. */
export function isTermStart(month: number, termStartMonths: number[] = [4, 9, 1]): boolean {
  return termStartMonths.slice(0, 3).includes(month);
}

/** Term period label for a month: "2026-T2". The year is the calendar year of the month. */
export function termPeriod(isoDate: string, termStartMonths: number[] = [4, 9, 1]): string {
  const year = isoDate.slice(0, 4);
  const month = Number(isoDate.slice(5, 7));
  return `${year}-T${termOf(month, termStartMonths)}`;
}

/** Human label: "November 2026", "Term 2 2026", "One-time". */
export function periodLabel(period: string): string {
  const m = MONTH_PERIOD.exec(period);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const t = TERM_PERIOD.exec(period);
  if (t) return `Term ${t[2]} ${t[1]}`;
  if (ONCE_PERIOD.test(period)) return 'One-time';
  return period;
}

/** Working days (Mon–Sat by default) between two ISO dates inclusive. */
export function workingDays(from: string, to: string, weekend: number[] = [0]): number {
  let n = 0;
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000) {
    if (!weekend.includes(new Date(d).getUTCDay())) n++;
  }
  return n;
}
