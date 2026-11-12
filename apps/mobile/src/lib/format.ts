import * as Crypto from 'expo-crypto';
export { formatPKR, periodLabel, METHOD_LABELS, ROLE_LABELS } from '@edusaas/shared';

export const fmtDate = (
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' },
) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', {
        ...opts,
        timeZone: iso.length === 10 ? 'UTC' : undefined,
      })
    : '—';

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const relative = (d: string | Date) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/** Idempotency keys and client ids: a random v4 UUID from the platform's secure generator. */
export const uuid = () => Crypto.randomUUID();
