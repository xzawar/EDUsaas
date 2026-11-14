'use client';

import { FilePlus2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmButton, Modal, useAction } from '@/components/overlay';
import { Alert, Button, Field, Select, Textarea } from '@/components/ui';
import { periodLabel } from '@/lib/periods';

export function GenerateButton({
  month,
  classes,
  hasFees,
}: {
  month: string;
  classes: { id: string; name: string }[];
  hasFees: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(month);
  const [classId, setClassId] = useState('');
  const { run, busy, error } = useAction();
  const months: string[] = [];
  for (let i = -1; i < 3; i++) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run<{ created: number; skipped: number }>(
      '/invoices/generate',
      { body: { period, classId: classId || undefined } },
      undefined,
    );
    if (r) {
      setOpen(false);
      alert(
        `${r.created} bill${r.created === 1 ? '' : 's'} created for ${periodLabel(period)}${r.skipped ? `; ${r.skipped} already existed` : ''}.`,
      );
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={!hasFees} title={hasFees ? undefined : 'Set up fees first'}>
        <FilePlus2 className="size-4" /> Generate month
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate fee bills"
        description="One bill per active student who doesn’t have one for that month yet. Safe to run again."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? 'Generating…' : 'Generate'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error.message}</Alert>}
          <Field label="Month" htmlFor="gen-period">
            <Select id="gen-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Class" htmlFor="gen-class">
            <Select id="gen-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Class {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </>
  );
}

export function InvoiceAdminActions({
  id,
  status,
  hasPayments,
  lateFeePaisa,
  waived,
}: {
  id: string;
  status: string;
  hasPayments: boolean;
  lateFeePaisa: number;
  waived: boolean;
}) {
  const { run } = useAction();
  const [reason, setReason] = useState('');
  const open = status === 'DUE' || status === 'PARTIAL';
  return (
    <>
      {open && lateFeePaisa > 0 && !waived && (
        <ConfirmButton
          label="Waive late fee"
          title="Waive the late fee on this bill?"
          message={
            <div className="space-y-3">
              <p>The late fee is removed; the fee itself stays due.</p>
              <Textarea
                aria-label="Reason"
                placeholder="Why?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          }
          confirmLabel="Waive"
          tone="primary"
          onConfirm={() => run(`/invoices/${id}/waive-late-fee`, { body: { reason } }, 'Late fee waived')}
        />
      )}
      {open && !hasPayments && (
        <ConfirmButton
          variant="danger-ghost"
          label="Cancel bill"
          title="Cancel this bill?"
          message={
            <div className="space-y-3">
              <p>Use this for a bill issued by mistake. It stays on record as cancelled.</p>
              <Textarea
                aria-label="Reason"
                placeholder="Why?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          }
          confirmLabel="Cancel bill"
          onConfirm={() => run(`/invoices/${id}/void`, { body: { reason } }, 'Bill cancelled')}
        />
      )}
    </>
  );
}
