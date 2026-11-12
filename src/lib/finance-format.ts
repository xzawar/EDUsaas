/** Pure formatting shared by server pages, client components and the mobile app. */

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK: 'Bank transfer',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
  CHEQUE: 'Cheque',
};

export const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';
