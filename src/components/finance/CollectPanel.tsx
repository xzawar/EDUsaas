'use client';

import { Printer, Search, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { ConfirmButton, FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Alert, Badge, Button, EmptyState, Field, Input, Table, Td, Textarea, Th } from '@/components/ui';
import {
  InvoiceStatus,
  MethodSelect,
  Money,
  MoneyInput,
  METHOD_LABELS,
  fmtDate,
  useClientKey,
} from '@/components/finance/shared';

type Hit = {
  id: string;
  name: string;
  username: string | null;
  rollNumber: number | null;
  section: string | null;
  withdrawn: boolean;
};
type Fees = {
  student: {
    id: string;
    name: string;
    username: string | null;
    rollNumber: number | null;
    section: string | null;
    status: string;
    guardianName: string | null;
    guardianPhone: string | null;
  };
  outstandingPaisa: number;
  advancePaisa: number;
  invoices: {
    id: string;
    number: string;
    period: string;
    dueOn: string;
    status: string;
    overdue: boolean;
    totalPaisa: number;
    paidPaisa: number;
    balancePaisa: number;
    lateFeePaisa: number;
  }[];
  payments: {
    id: string;
    receiptNumber: string;
    amountPaisa: number;
    method: string;
    receivedOn: string;
    reversed: boolean;
    isReversal: boolean;
    invoiceId: string | null;
  }[];
};
type Receipt = { id: string; receiptNumber: string; amountPaisa: number; allocatedPaisa: number };

/** The counter: find a student, see what's owed, take money, print the receipt. */
export function CollectPanel({ initialStudentId, today }: { initialStudentId?: string; today: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [fees, setFees] = useState<Fees | null>(null);
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(id: string) {
    setLoading(true);
    const r = await api<Fees>(`/students/${id}/fees`);
    setLoading(false);
    if (r.ok) setFees(r.data);
  }
  useEffect(() => {
    if (initialStudentId) void load(initialStudentId);
  }, [initialStudentId]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const r = await api<{ students: Hit[] }>(`/search?q=${encodeURIComponent(q.trim())}`);
      setSearching(false);
      if (r.ok) setHits(r.data.students.slice(0, 8));
    }, 200);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <Input
          aria-label="Find a student"
          placeholder="Student name, username or roll number…"
          className="pl-10"
          value={q}
          autoFocus={!initialStudentId}
          onChange={(e) => setQ(e.target.value)}
        />
        {hits.length > 0 && (
          <ul
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-slate-200"
            role="listbox"
          >
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setQ('');
                    setHits([]);
                    void load(h.id);
                  }}
                >
                  <span>
                    <span className="font-medium">{h.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{h.username}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {h.section}
                    {h.rollNumber ? ` · ${h.rollNumber}` : ''}
                    {h.withdrawn ? ' · withdrawn' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
      </div>

      {!fees && !loading && (
        <EmptyState
          icon={<Search className="size-5" />}
          title="Find the student first"
          description="Type a name or username. You’ll see their bills, take the payment and print the receipt."
        />
      )}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {fees && <StudentFees fees={fees} today={today} onChanged={() => load(fees.student.id)} onReceipt={setReceipt} />}
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function StudentFees({
  fees,
  today,
  onChanged,
  onReceipt,
}: {
  fees: Fees;
  today: string;
  onChanged: () => void;
  onReceipt: (r: Receipt) => void;
}) {
  const [paying, setPaying] = useState<{ invoiceId?: string; max?: number } | null>(null);
  const { busy } = useAction();
  const open = fees.invoices.filter((i) => i.status === 'DUE' || i.status === 'PARTIAL');
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-slate-50 p-4">
        <div>
          <p className="text-lg font-semibold">{fees.student.name}</p>
          <p className="text-sm text-slate-600">
            <span className="font-mono">{fees.student.username}</span>
            {fees.student.section ? ` · ${fees.student.section}` : ''}
            {fees.student.rollNumber ? ` · Roll no. ${fees.student.rollNumber}` : ''}
          </p>
          {fees.student.guardianName && (
            <p className="text-sm text-slate-600">
              Guardian: {fees.student.guardianName}
              {fees.student.guardianPhone ? ` · ${fees.student.guardianPhone}` : ''}
            </p>
          )}
          {fees.student.status !== 'ACTIVE' && <Badge tone="amber">{fees.student.status.toLowerCase()}</Badge>}
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Outstanding</p>
          <p
            className={`text-2xl font-semibold tabular-nums ${fees.outstandingPaisa > 0 ? 'text-rose-700' : 'text-emerald-700'}`}
          >
            <Money paisa={fees.outstandingPaisa} />
          </p>
          {fees.advancePaisa > 0 && (
            <p className="text-xs text-slate-500">
              On account: <Money paisa={fees.advancePaisa} />
            </p>
          )}
          <Button className="mt-2" onClick={() => setPaying({})} disabled={busy}>
            Take payment
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Bills</h3>
        {fees.invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No bills yet. Generate this month’s bills from the Invoices page.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Bill</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {fees.invoices.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <a href={`/staff/finance/invoices/${i.id}`} className="font-medium hover:underline">
                      {i.number}
                    </a>
                    <span className="block text-xs text-slate-500">{i.period}</span>
                  </Td>
                  <Td className="text-slate-600">{fmtDate(i.dueOn)}</Td>
                  <Td className="text-right">
                    <Money paisa={i.totalPaisa} />
                    {i.lateFeePaisa > 0 && <span className="block text-xs text-rose-600">incl. late fee</span>}
                  </Td>
                  <Td className="text-right">
                    <Money paisa={i.paidPaisa} />
                  </Td>
                  <Td className="text-right font-medium">
                    <Money paisa={i.balancePaisa} />
                  </Td>
                  <Td>
                    <InvoiceStatus status={i.status} overdue={i.overdue} />
                  </Td>
                  <Td className="text-right">
                    {(i.status === 'DUE' || i.status === 'PARTIAL') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setPaying({ invoiceId: i.id, max: i.balancePaisa })}
                      >
                        Pay
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {fees.payments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Receipts</h3>
          <Table>
            <thead>
              <tr>
                <Th>Receipt</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {fees.payments.map((p) => (
                <tr key={p.id} className={p.reversed ? 'text-slate-400 line-through' : ''}>
                  <Td className="font-medium">
                    {p.receiptNumber}
                    {p.isReversal && <span className="ml-1 text-xs text-rose-600 no-underline">reversal</span>}
                  </Td>
                  <Td>{fmtDate(p.receivedOn)}</Td>
                  <Td>{METHOD_LABELS[p.method] ?? p.method}</Td>
                  <Td className="text-right">
                    <Money paisa={p.amountPaisa} />
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <a
                      href={`/api/v1/payments/${p.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className="text-sm text-[var(--accent)] hover:underline"
                    >
                      PDF
                    </a>
                    {!p.reversed && !p.isReversal && (
                      <ReverseButton paymentId={p.id} receipt={p.receiptNumber} onDone={onChanged} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {paying && (
        <PaymentForm
          studentId={fees.student.id}
          studentName={fees.student.name}
          invoices={open}
          preset={paying}
          today={today}
          onClose={() => setPaying(null)}
          onDone={(r) => {
            setPaying(null);
            onChanged();
            onReceipt(r);
          }}
        />
      )}
    </div>
  );
}

function ReverseButton({ paymentId, receipt, onDone }: { paymentId: string; receipt: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const { run } = useAction();
  return (
    <ConfirmButton
      variant="ghost"
      size="sm"
      label={
        <span className="inline-flex items-center gap-1 text-xs">
          <Undo2 className="size-3.5" /> Reverse
        </span>
      }
      title={`Reverse receipt ${receipt}?`}
      message={
        <div className="space-y-3">
          <p>The receipt stays on record, marked reversed. The bill goes back to unpaid.</p>
          <Textarea
            aria-label="Reason"
            placeholder="Why? (e.g. wrong student, bounced cheque)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      }
      confirmLabel="Reverse payment"
      onConfirm={async () => {
        const r = await run(`/payments/${paymentId}/reverse`, { body: { reason } }, 'Payment reversed');
        if (r) onDone();
      }}
    />
  );
}

export function PaymentForm({
  studentId,
  studentName,
  invoices,
  preset,
  today,
  onClose,
  onDone,
}: {
  studentId: string;
  studentName: string;
  invoices: Fees['invoices'];
  preset: { invoiceId?: string; max?: number };
  today: string;
  onClose: () => void;
  onDone: (r: Receipt) => void;
}) {
  const [invoiceId, setInvoiceId] = useState(preset.invoiceId ?? invoices[0]?.id ?? '');
  const selected = invoices.find((i) => i.id === invoiceId);
  const [amount, setAmount] = useState<number | null>(preset.max ?? selected?.balancePaisa ?? null);
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [receivedOn, setReceivedOn] = useState(today);
  const [note, setNote] = useState('');
  const [allowAdvance, setAllowAdvance] = useState(false);
  const { key } = useClientKey();
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  const over = selected && amount !== null && amount > selected.balancePaisa;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null) return;
    const r = await run<{ payment: Receipt; duplicate: boolean }>(
      '/payments',
      {
        body: {
          studentId,
          invoiceId: invoiceId || undefined,
          amountPaisa: amount,
          method,
          reference: reference || undefined,
          receivedOn,
          note: note || undefined,
          clientKey: key,
          allowAdvance: allowAdvance || !invoiceId,
        },
      },
      'Payment recorded',
    );
    if (r) onDone(r.payment);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Take payment from ${studentName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || amount === null || amount <= 0 || (!!over && !allowAdvance)} onClick={submit}>
            {busy ? 'Saving…' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && !Object.keys(errors).length && <Alert>{error.message}</Alert>}
        <Field
          label="For bill"
          htmlFor="pay-invoice"
          hint={invoices.length ? undefined : 'No open bills; this will be kept on account.'}
        >
          <select
            id="pay-invoice"
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              const inv = invoices.find((i) => i.id === e.target.value);
              setAmount(inv ? inv.balancePaisa : null);
            }}
          >
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number} · {i.period} · balance {Math.round(i.balancePaisa / 100).toLocaleString()}
              </option>
            ))}
            <option value="">On account (advance)</option>
          </select>
        </Field>
        <Field label="Amount received" htmlFor="pay-amount">
          <MoneyInput id="pay-amount" valuePaisa={amount} onChange={setAmount} min={1} autoFocus />
          <FieldError message={errors.amountPaisa} />
          {over && (
            <label className="mt-2 flex items-start gap-2 text-sm text-amber-800">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={allowAdvance}
                onChange={(e) => setAllowAdvance(e.target.checked)}
              />
              More than the balance. Keep the extra <Money paisa={amount! - selected!.balancePaisa} /> on account for
              the next bill.
            </label>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Paid by" htmlFor="pay-method">
            <MethodSelect id="pay-method" value={method} onChange={setMethod} />
          </Field>
          <Field label="Date received" htmlFor="pay-date">
            <Input
              id="pay-date"
              type="date"
              max={today}
              value={receivedOn}
              onChange={(e) => setReceivedOn(e.target.value)}
            />
            <FieldError message={errors.receivedOn} />
          </Field>
        </div>
        {method !== 'CASH' && (
          <Field label="Reference / transaction no." htmlFor="pay-ref">
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. TX 48213 or cheque no."
            />
          </Field>
        )}
        <Field label="Note (optional)" htmlFor="pay-note">
          <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function ReceiptDialog({ receipt, onClose }: { receipt: Receipt | null; onClose: () => void }) {
  if (!receipt) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Receipt ${receipt.receiptNumber}`}
      description="Saved. Print it for the parent, or share the PDF."
      footer={
        <>
          <a
            href={`/api/v1/payments/${receipt.id}/receipt`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <Printer className="size-4" /> Print / PDF
          </a>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <p className="text-3xl font-semibold tabular-nums">
        <Money paisa={receipt.amountPaisa} />
      </p>
      {receipt.allocatedPaisa < receipt.amountPaisa && (
        <p className="mt-1 text-sm text-slate-600">
          <Money paisa={receipt.amountPaisa - receipt.allocatedPaisa} /> kept on account for the next bill.
        </p>
      )}
    </Modal>
  );
}
