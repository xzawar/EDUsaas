'use client';

import { useId, useState } from 'react';
import { formatPKR, toPaisa, toRupees } from '@/lib/money';
import { Badge, Input, Select, cx } from '@/components/ui';
import { METHOD_LABELS, fmtDate } from '@/lib/finance-format';

export { METHOD_LABELS, fmtDate };

export function Money({ paisa, className }: { paisa: number; className?: string }) {
  return <span className={cx('tabular-nums', className)}>{formatPKR(paisa)}</span>;
}

/** Rupees in, paisa out. Keeps what the user typed until blur, then normalises. */
export function MoneyInput({
  id,
  valuePaisa,
  onChange,
  min = 0,
  autoFocus,
  disabled,
}: {
  id: string;
  valuePaisa: number | null;
  onChange: (paisa: number | null) => void;
  min?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(valuePaisa === null ? '' : toRupees(valuePaisa));
  const [bad, setBad] = useState(false);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
        PKR
      </span>
      <Input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        className={cx('pl-12 text-right tabular-nums', bad && 'border-red-400')}
        value={text}
        aria-invalid={bad}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const p = e.target.value.trim() === '' ? null : toPaisa(e.target.value);
            setBad(p !== null && p < min);
            onChange(p !== null && p >= min ? p : null);
          } catch {
            setBad(true);
            onChange(null);
          }
        }}
        onBlur={() => {
          try {
            if (text.trim() !== '') setText(toRupees(toPaisa(text)));
          } catch {
            /* keep what they typed; it's marked invalid */
          }
        }}
      />
    </div>
  );
}

export function MethodSelect({
  id,
  value,
  onChange,
  cashAllowed = true,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  cashAllowed?: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(METHOD_LABELS)
        .filter(([k]) => cashAllowed || k !== 'CASH')
        .map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
    </Select>
  );
}

export function InvoiceStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  if (status === 'PAID') return <Badge tone="green">Paid</Badge>;
  if (status === 'PARTIAL')
    return <Badge tone={overdue ? 'red' : 'amber'}>{overdue ? 'Part paid · overdue' : 'Part paid'}</Badge>;
  if (status === 'VOID') return <Badge>Cancelled</Badge>;
  if (status === 'WAIVED') return <Badge tone="blue">Waived</Badge>;
  return <Badge tone={overdue ? 'red' : 'slate'}>{overdue ? 'Overdue' : 'Due'}</Badge>;
}

/** A stable per-form idempotency key: a retry after a network blip never double-posts. */
export function useClientKey() {
  const seed = useId();
  const [key, setKey] = useState(() => crypto.randomUUID());
  return { key, reset: () => setKey(crypto.randomUUID()), seed };
}
