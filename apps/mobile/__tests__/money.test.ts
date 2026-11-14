import { formatPKR, toPaisa, toRupees } from '@edusaas/shared';

it('parses what a cashier types', () => {
  expect(toPaisa('4500')).toBe(450000);
  expect(toPaisa('4,500.50')).toBe(450050);
  expect(() => toPaisa('abc')).toThrow();
});
it('round-trips for the amount box', () => {
  expect(toRupees(450050)).toBe('4500.50');
  expect(toPaisa(toRupees(123456))).toBe(123456);
});
it('formats for receipts', () => {
  expect(formatPKR(450000)).toMatch(/4,500/);
});
