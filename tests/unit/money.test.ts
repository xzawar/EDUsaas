import { describe, expect, it } from 'vitest';
import { amountInWords, applyDiscount, formatPKR, lateFee, numberInWords, toPaisa, toRupees } from '@/lib/money';
import { isTermStart, monthBounds, nextMonth, periodLabel, termOf, termPeriod, workingDays } from '@/lib/periods';

describe('money (Finance §2.3: integer paisa, half-up rounding)', () => {
  it('converts rupees to paisa and back', () => {
    expect(toPaisa('12.345')).toBe(1235);
    expect(toPaisa('1,500')).toBe(150000);
    expect(toPaisa(1500.5)).toBe(150050);
    expect(toPaisa('0')).toBe(0);
    expect(() => toPaisa('-1')).toThrow();
    expect(() => toPaisa('abc')).toThrow();
    expect(() => toPaisa('')).toThrow();
    expect(toRupees(150050)).toBe('1500.50');
    expect(toRupees(5n)).toBe('0.05');
  });

  it('formats PKR', () => {
    expect(formatPKR(123450)).toBe('PKR 1,234.50');
    expect(formatPKR(0)).toBe('PKR 0.00');
    expect(formatPKR(-250000n)).toBe('-PKR 2,500.00');
    expect(formatPKR(1234567890)).toBe('PKR 12,345,678.90');
  });

  it('applies percent and fixed discounts within bounds', () => {
    expect(applyDiscount(100000, { kind: 'PERCENT', value: 1250 })).toBe(12500);
    expect(applyDiscount(100000, { kind: 'PERCENT', value: 10000 })).toBe(100000);
    expect(applyDiscount(1000, { kind: 'FIXED', value: 5000 })).toBe(1000);
    expect(applyDiscount(333, { kind: 'PERCENT', value: 5000 })).toBe(167); // 166.5 → 167
    expect(applyDiscount(0, { kind: 'FIXED', value: 100 })).toBe(0);
  });

  it('computes late fees with grace and cap', () => {
    const perDay = { kind: 'PER_DAY' as const, value: 5000, capPaisa: 50000, graceDays: 3 };
    expect(lateFee(perDay, 100000, '2026-11-10', '2026-11-12')).toBe(0); // inside grace
    expect(lateFee(perDay, 100000, '2026-11-10', '2026-11-14')).toBe(5000); // 1 late day
    expect(lateFee(perDay, 100000, '2026-11-10', '2026-11-30')).toBe(50000); // 17 days, capped
    expect(
      lateFee({ kind: 'FIXED', value: 20000, capPaisa: null, graceDays: 0 }, 100000, '2026-11-10', '2026-11-11'),
    ).toBe(20000);
    expect(
      lateFee({ kind: 'PERCENT', value: 500, capPaisa: null, graceDays: 0 }, 100000, '2026-11-10', '2026-12-01'),
    ).toBe(5000);
    expect(lateFee({ kind: 'PERCENT', value: 500, capPaisa: null, graceDays: 0 }, 0, '2026-11-10', '2026-12-01')).toBe(
      0,
    );
  });

  it('writes amounts in words for receipts', () => {
    expect(numberInWords(0)).toBe('zero');
    expect(numberInWords(1234)).toBe('one thousand two hundred thirty-four');
    expect(numberInWords(12_34_567)).toBe('twelve lakh thirty-four thousand five hundred sixty-seven');
    expect(numberInWords(3_00_00_000)).toBe('three crore');
    expect(amountInWords(123450)).toBe('One thousand two hundred thirty-four rupees and fifty paisa only');
    expect(amountInWords(100)).toBe('One rupee only');
  });
});

describe('periods (Finance §2.2)', () => {
  it('month helpers', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02').to).toBe('2028-02-29');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(() => monthBounds('2026-13')).toThrow();
  });

  it('terms wrap around the year', () => {
    expect(termOf(4)).toBe(1);
    expect(termOf(8)).toBe(1);
    expect(termOf(9)).toBe(2);
    expect(termOf(12)).toBe(2);
    expect(termOf(1)).toBe(3);
    expect(termOf(3)).toBe(3);
    expect(termOf(1, [1, 5, 9])).toBe(1);
    expect(isTermStart(9)).toBe(true);
    expect(isTermStart(10)).toBe(false);
    expect(termPeriod('2026-11-05')).toBe('2026-T2');
  });

  it('labels', () => {
    expect(periodLabel('2026-11')).toBe('November 2026');
    expect(periodLabel('2026-T3')).toBe('Term 3 2026');
    expect(periodLabel('2026-ONCE-00000000-0000-4000-8000-000000000000')).toBe('One-time');
  });

  it('working days exclude Sundays by default', () => {
    expect(workingDays('2026-11-01', '2026-11-07')).toBe(6); // 1 Nov 2026 is a Sunday
    expect(workingDays('2026-11-02', '2026-11-06', [0, 6])).toBe(5);
  });
});
