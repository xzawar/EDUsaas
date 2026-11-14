'use client';

import { Check, FileCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Badge, Button, EmptyState, Textarea } from '@/components/ui';
import { METHOD_LABELS, Money, fmtDate } from '@/components/finance/shared';

type Claim = {
  id: string;
  amountPaisa: number;
  method: string;
  reference: string;
  paidOn: string;
  status: string;
  decisionNote: string | null;
  paymentId: string | null;
  hasProof: boolean;
  createdAt: string;
  invoice: { number: string; period: string };
  student: { id: string; name: string; username: string | null; section: string | null };
};

export function ClaimQueue({ items }: { items: Claim[] }) {
  const [rejecting, setRejecting] = useState<Claim | null>(null);
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<Claim | null>(null);
  const { run, busy } = useAction();
  if (!items.length)
    return (
      <EmptyState
        icon={<FileCheck className="size-5" />}
        title="Nothing to check"
        description="When a parent sends a payment screenshot from the Fees page, it shows up here."
      />
    );
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {items.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 py-3">
            {c.hasProof ? (
              <button
                type="button"
                onClick={() => setViewing(c)}
                className="shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-200"
                aria-label="View proof"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/fees/claims/${c.id}/proof`} alt="" className="size-16 object-cover" />
              </button>
            ) : (
              <div className="grid size-16 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">
                No photo
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                <Link href={`/staff/finance/collect?student=${c.student.id}`} className="hover:underline">
                  {c.student.name}
                </Link>
                <span className="ml-2 text-xs text-slate-500">
                  {c.student.section} · {c.student.username}
                </span>
              </p>
              <p className="text-sm text-slate-600">
                <Money paisa={c.amountPaisa} className="font-medium text-slate-900" /> by{' '}
                {METHOD_LABELS[c.method] ?? c.method} · ref <span className="font-mono">{c.reference}</span> · paid{' '}
                {fmtDate(c.paidOn)}
              </p>
              <p className="text-xs text-slate-500">
                For bill {c.invoice.number} ({c.invoice.period}) · sent{' '}
                {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {c.decisionNote && <> · {c.decisionNote}</>}
              </p>
            </div>
            {c.status === 'PENDING' ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(c)}>
                  <X className="size-4" /> Reject
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(
                      `/fees/claims/${c.id}/decide`,
                      { body: { decision: 'CONFIRM' } },
                      'Payment confirmed and receipt issued',
                    )
                  }
                >
                  <Check className="size-4" /> Confirm
                </Button>
              </div>
            ) : c.status === 'CONFIRMED' ? (
              <span className="flex items-center gap-2">
                <Badge tone="green">Confirmed</Badge>
                {c.paymentId && (
                  <a
                    href={`/api/v1/payments/${c.paymentId}/receipt`}
                    target="_blank"
                    rel="noopener"
                    className="text-sm text-[var(--accent)] hover:underline"
                  >
                    Receipt
                  </a>
                )}
              </span>
            ) : (
              <Badge tone="red">Rejected</Badge>
            )}
          </li>
        ))}
      </ul>
      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this payment proof"
        description="The parent sees your note, so say what to do next."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Back
            </Button>
            <Button
              variant="danger"
              disabled={busy || note.trim().length < 3}
              onClick={async () => {
                if (!rejecting) return;
                const r = await run(
                  `/fees/claims/${rejecting.id}/decide`,
                  { body: { decision: 'REJECT', note: note.trim() } },
                  'Proof rejected',
                );
                if (r) {
                  setRejecting(null);
                  setNote('');
                }
              }}
            >
              Reject
            </Button>
          </>
        }
      >
        <Textarea
          aria-label="Reason"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. We can’t find this transaction. Please send the full screenshot with the date."
        />
      </Modal>
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Proof from ${viewing.student.name}` : ''}
        size="lg"
      >
        {viewing && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/v1/fees/claims/${viewing.id}/proof`}
            alt="Payment proof"
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
        )}
      </Modal>
    </>
  );
}
