/**
 * Money helpers (Finance spec §2). Amounts are integer paisa everywhere (1 PKR = 100 paisa); the UI shows rupees.
 * Pure functions, shared with the mobile app.
 */

export const CURRENCY = 'PKR';

/** "PKR 1,234.50". Negative amounts get a leading minus. */
export function formatPKR(paisa: number | bigint): string {
  const n = typeof paisa === 'bigint' ? Number(paisa) : paisa;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${CURRENCY} ${rupees.toLocaleString('en-US')}.${String(rest).padStart(2, '0')}`;
}

/** Rupees (string or number, up to 2 decimals) → paisa, rounded half-up. Throws on blank, NaN or negative. */
export function toPaisa(rupees: string | number): number {
  const text = String(rupees).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) throw new RangeError('Enter an amount like 1500 or 1500.50');
  const [whole, frac = ''] = text.split('.');
  const cents = (frac + '000').slice(0, 3); // keep three decimals for rounding
  let paisa = Number(whole) * 100 + Number(cents.slice(0, 2));
  if (Number(cents[2]) >= 5) paisa += 1;
  if (!Number.isSafeInteger(paisa)) throw new RangeError('Amount is too large');
  return paisa;
}

/** Paisa → "1234.50" for inputs. */
export function toRupees(paisa: number | bigint): string {
  const n = Math.round(Number(paisa));
  return `${Math.trunc(n / 100)}.${String(Math.abs(n) % 100).padStart(2, '0')}`;
}

export type Discount = { kind: 'PERCENT' | 'FIXED'; value: number };

/**
 * PERCENT value is hundredths of a percent (1250 = 12.50%), FIXED value is paisa. Result is the discount amount,
 * rounded half-up, never above the line amount and never negative.
 */
export function applyDiscount(amountPaisa: number, d: Discount): number {
  if (amountPaisa <= 0) return 0;
  const raw = d.kind === 'PERCENT' ? (amountPaisa * d.value) / 10_000 : d.value;
  return Math.max(0, Math.min(amountPaisa, Math.round(raw)));
}

export type LateFeeRule = {
  kind: 'FIXED' | 'PERCENT' | 'PER_DAY';
  /** FIXED / PER_DAY: paisa. PERCENT: hundredths of a percent of the outstanding amount. */
  value: number;
  capPaisa: number | null;
  graceDays: number;
};

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Late fee owed on `basePaisa` when `today` is past `dueOn` + grace. 0 inside the grace period. */
export function lateFee(rule: LateFeeRule, basePaisa: number, dueOn: string, today: string): number {
  const lateDays = daysBetween(dueOn, today) - rule.graceDays;
  if (lateDays <= 0 || basePaisa <= 0 || rule.value <= 0) return 0;
  let fee: number;
  if (rule.kind === 'FIXED') fee = rule.value;
  else if (rule.kind === 'PERCENT') fee = Math.round((basePaisa * rule.value) / 10_000);
  else fee = rule.value * lateDays;
  if (rule.capPaisa !== null) fee = Math.min(fee, rule.capPaisa);
  return Math.max(0, fee);
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : ''));
  } else if (n > 0) parts.push(ONES[n]!);
  return parts.join(' ');
}

/** Whole number in words, Pakistani grouping (crore, lakh, thousand). */
export function numberInWords(n: number): string {
  if (n === 0) return 'zero';
  const out: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore) out.push(`${belowThousand(crore)} crore`);
  if (lakh) out.push(`${belowThousand(lakh)} lakh`);
  if (thousand) out.push(`${belowThousand(thousand)} thousand`);
  if (rest) out.push(belowThousand(rest));
  return out.join(' ');
}

/** "One thousand two hundred thirty-four rupees and fifty paisa only" — for receipts. */
export function amountInWords(paisa: number | bigint): string {
  const n = Math.abs(Math.round(Number(paisa)));
  const rupees = Math.floor(n / 100);
  const rest = n % 100;
  let text = `${numberInWords(rupees)} rupee${rupees === 1 ? '' : 's'}`;
  if (rest) text += ` and ${numberInWords(rest)} paisa`;
  text += ' only';
  return text.charAt(0).toUpperCase() + text.slice(1);
}
