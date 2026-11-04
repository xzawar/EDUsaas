'use client';

import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmButton, FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Alert, Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui';

export type LeaveRow = {
  id: string;
  applicant: string;
  applicantRole: string;
  section: string | null;
  type: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: string;
  decisionNote: string | null;
  escalated: boolean;
};

const TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'slate' } as const;
const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const range = (r: LeaveRow) => (r.fromDate === r.toDate ? fmt(r.fromDate) : `${fmt(r.fromDate)} – ${fmt(r.toDate)}`);

export function ApplyLeaveButton({ types, today }: { types: { id: string; name: string }[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ typeId: types[0]?.id ?? '', fromDate: today, toDate: today, reason: '' });
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run('/leave', { body: v }, 'Leave request sent')) {
      setOpen(false);
      setV({ ...v, reason: '' });
    }
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Apply for leave
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Apply for leave"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !v.reason.trim()} onClick={submit}>
              Send request
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && !Object.keys(errors).length && <Alert>{error.message}</Alert>}
          <Field label="Type" htmlFor="lv-type">
            <Select id="lv-type" value={v.typeId} onChange={(e) => setV({ ...v, typeId: e.target.value })}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="lv-from">
              <Input id="lv-from" type="date" min={today} value={v.fromDate} onChange={(e) => setV({ ...v, fromDate: e.target.value, toDate: v.toDate < e.target.value ? e.target.value : v.toDate })} />
            </Field>
            <Field label="To" htmlFor="lv-to">
              <Input id="lv-to" type="date" min={v.fromDate} value={v.toDate} onChange={(e) => setV({ ...v, toDate: e.target.value })} />
              <FieldError message={errors.toDate} />
            </Field>
          </div>
          <Field label="Reason" htmlFor="lv-reason">
            <Textarea id="lv-reason" rows={3} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
            <FieldError message={errors.reason} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

export function MyLeaveList({ rows }: { rows: LeaveRow[] }) {
  const { run } = useAction();
  if (!rows.length) return <EmptyState title="No leave requests yet" />;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              {r.type} · {range(r)} <span className="text-sm font-normal text-slate-500">({r.days} day{r.days === 1 ? '' : 's'})</span>
            </p>
            <p className="text-sm text-slate-600">{r.reason}</p>
            {r.decisionNote && <p className="mt-1 text-sm text-slate-500">Note: {r.decisionNote}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={TONE[r.status as keyof typeof TONE] ?? 'slate'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
            {r.status === 'PENDING' && (
              <ConfirmButton size="sm" variant="ghost" label="Cancel" title="Cancel this request?" message={<p>Your approver will no longer see it.</p>} confirmLabel="Cancel request" onConfirm={() => run(`/leave/${r.id}/cancel`, { method: 'POST' }, 'Request cancelled')} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ApprovalList({ rows }: { rows: LeaveRow[] }) {
  const { run, busy } = useAction();
  const [note, setNote] = useState<Record<string, string>>({});
  if (!rows.length) return <EmptyState title="Nothing waiting for you" description="New requests from your students or staff appear here." />;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {r.applicant} {r.section && <Badge>{r.section}</Badge>} {r.escalated && <Badge tone="amber">Escalated</Badge>}
              </p>
              <p className="text-sm text-slate-700">
                {r.type} · {range(r)} ({r.days} day{r.days === 1 ? '' : 's'})
              </p>
              <p className="text-sm text-slate-600">{r.reason}</p>
            </div>
            {r.status === 'PENDING' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input placeholder="Note (optional)" value={note[r.id] ?? ''} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} className="w-44 py-1.5" aria-label={`Note for ${r.applicant}`} />
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(`/leave/${r.id}/decision`, { body: { decision: 'REJECTED', note: note[r.id] || undefined } }, 'Request declined')}>
                  Decline
                </Button>
                <Button size="sm" disabled={busy} onClick={() => run(`/leave/${r.id}/decision`, { body: { decision: 'APPROVED', note: note[r.id] || undefined } }, 'Request approved')}>
                  Approve
                </Button>
              </div>
            ) : (
              <Badge tone={TONE[r.status as keyof typeof TONE] ?? 'slate'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Badge>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
