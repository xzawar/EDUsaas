'use client';

import { KeyRound, LifeBuoy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';

export type Grant = {
  id: string;
  requesterName: string;
  reason: string;
  durationMinutes: number;
  status: 'AWAITING_OWNER' | 'PENDING' | 'ACTIVE' | 'DENIED' | 'REVOKED' | 'EXPIRED';
  createdAt: string | Date;
  expiresAt: string | Date | null;
  endedAt: string | Date | null;
};

const STATUS: Record<Grant['status'], { label: string; tone: 'slate' | 'green' | 'amber' | 'red' | 'blue' }> = {
  AWAITING_OWNER: { label: 'Waiting for the Platform Owner', tone: 'blue' },
  PENDING: { label: 'Waiting for the school', tone: 'amber' },
  ACTIVE: { label: 'Active', tone: 'green' },
  DENIED: { label: 'Denied', tone: 'slate' },
  REVOKED: { label: 'Ended early', tone: 'slate' },
  EXPIRED: { label: 'Expired', tone: 'slate' },
};
const fmt = (d: string | Date) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });
const dur = (m: number) => (m >= 60 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} minutes`);

function History({ grants }: { grants: Grant[] }) {
  if (!grants.length) return <p className="text-sm text-slate-500">No support access has ever been requested.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {grants.map((g) => (
        <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {g.requesterName} · {dur(g.durationMinutes)}
            </p>
            <p className="text-slate-600">{g.reason}</p>
            <p className="text-xs text-slate-500">
              Asked {fmt(g.createdAt)}
              {g.status === 'ACTIVE' && g.expiresAt && ` · ends ${fmt(g.expiresAt)}`}
              {g.endedAt && ` · ended ${fmt(g.endedAt)}`}
            </p>
          </div>
          <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
        </li>
      ))}
    </ul>
  );
}

// ── School side (Settings) ──────────────────────────────────────────────────

export function SchoolSupportCard({ grants }: { grants: Grant[] }) {
  const { run } = useAction();
  const pending = grants.find((g) => g.status === 'PENDING');
  const active = grants.find((g) => g.status === 'ACTIVE');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        EDUsaas staff can’t see your school’s data. If you need help, they ask here first. Access is read-only,
        time-limited, and everything they view shows up in your audit log.
      </p>
      {pending && (
        <Alert tone="warning">
          <p className="font-medium">
            {pending.requesterName} asks for read-only access for {dur(pending.durationMinutes)}.
          </p>
          <p className="mt-1">Reason: {pending.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                run(
                  `/support-grants/${pending.id}/decision`,
                  { body: { decision: 'APPROVE' } },
                  'Support access allowed',
                )
              }
            >
              Allow for {dur(pending.durationMinutes)}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                run(`/support-grants/${pending.id}/decision`, { body: { decision: 'DENY' } }, 'Request denied')
              }
            >
              Deny
            </Button>
          </div>
        </Alert>
      )}
      {active && (
        <Alert tone="info">
          <p className="font-medium">
            <ShieldCheck className="mr-1 inline size-4" aria-hidden /> {active.requesterName} has read-only access until{' '}
            {active.expiresAt ? fmt(active.expiresAt) : '—'}.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                run(`/support-grants/${active.id}/decision`, { body: { decision: 'END' } }, 'Support access ended')
              }
            >
              End access now
            </Button>
            <Link
              href="/staff/audit?category=support"
              className="self-center text-sm font-medium text-[var(--accent)] hover:underline"
            >
              See what they viewed
            </Link>
          </div>
        </Alert>
      )}
      <History grants={grants} />
    </div>
  );
}

// ── Platform side ───────────────────────────────────────────────────────────

export function PlatformSupportPanel({
  tenantId,
  schoolName,
  grants,
  admins,
}: {
  tenantId: string;
  schoolName: string;
  grants: Grant[];
  admins: { id: string; name: string; email: string | null; locked: boolean }[];
}) {
  const { run, busy } = useAction();
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('60');
  const pending = grants.find((g) => g.status === 'PENDING');
  const active = grants.find((g) => g.status === 'ACTIVE');
  const open = pending ?? active;

  return (
    <div className="space-y-5">
      {active ? (
        <Alert tone="success">
          <p className="font-medium">
            {schoolName} allowed read-only access until {active.expiresAt ? fmt(active.expiresAt) : '—'}.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={`/platform/tenants/${tenantId}/support`}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
            >
              Open support view
            </Link>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run(`/platform/tenants/${tenantId}/support`, { method: 'DELETE' }, 'Access ended')}
            >
              End access
            </Button>
          </div>
        </Alert>
      ) : pending ? (
        <Alert tone="info">
          Waiting for {schoolName}’s School Admin to approve your request ({dur(pending.durationMinutes)}).{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => run(`/platform/tenants/${tenantId}/support`, { method: 'DELETE' }, 'Request withdrawn')}
          >
            Withdraw
          </button>
        </Alert>
      ) : null}

      {!open && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              '/platform/tenants/' + tenantId + '/support',
              { body: { reason, durationMinutes: Number(minutes) } },
              'Request sent to the school',
            );
            if (r) setReason('');
          }}
        >
          <Field label="Why do you need access?" htmlFor="sg-reason" hint="The School Admin sees this before deciding.">
            <Textarea
              id="sg-reason"
              rows={3}
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ticket #142: attendance totals look wrong for class 7-B"
            />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="For how long?" htmlFor="sg-min">
              <Select id="sg-min" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </Select>
            </Field>
            <Button type="submit" disabled={busy || reason.trim().length < 10}>
              <LifeBuoy className="size-4" /> Ask for access
            </Button>
          </div>
        </form>
      )}

      <div>
        <p className="mb-1 text-sm font-semibold">History</p>
        <History grants={grants} />
      </div>

      <EmergencyReset tenantId={tenantId} admins={admins} />
    </div>
  );
}

function EmergencyReset({
  tenantId,
  admins,
}: {
  tenantId: string;
  admins: { id: string; name: string; email: string | null; locked: boolean }[];
}) {
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(admins[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ name: string; email: string | null; temporaryPassword: string } | null>(null);
  if (!admins.length) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4">
      <p className="text-sm font-semibold text-red-900">Emergency: school locked out</p>
      <p className="mt-1 text-sm text-red-900/80">
        Reset a School Admin’s password only when the school asks and can’t sign in. The school is notified and it
        appears in their audit log.
      </p>
      <ul className="mt-2 text-sm text-slate-700">
        {admins.map((a) => (
          <li key={a.id}>
            {a.name} · {a.email} {a.locked && <Badge tone="red">Locked</Badge>}
          </li>
        ))}
      </ul>
      <Button className="mt-3" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <KeyRound className="size-4" /> Reset a School Admin password…
      </Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setResult(null);
          setTyped('');
          setReason('');
        }}
        title={result ? 'New temporary password' : 'Reset a School Admin password'}
        description={
          result
            ? 'Give it to the School Admin by phone. It is shown only once; they must change it when they sign in.'
            : undefined
        }
        footer={
          result ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button
              disabled={busy || typed !== 'RESET' || reason.trim().length < 10}
              onClick={async () => {
                const r = await run<{ name: string; email: string | null; temporaryPassword: string }>(
                  `/platform/tenants/${tenantId}/admin-reset`,
                  {
                    body: { userId, reason, confirm: 'RESET' },
                  },
                );
                if (r) setResult(r);
              }}
            >
              Reset password
            </Button>
          )
        }
      >
        {result ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-4">
            <p className="font-semibold">{result.name}</p>
            <p className="text-sm text-slate-600">{result.email}</p>
            <p className="mt-2 font-mono text-lg font-semibold">{result.temporaryPassword}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="School Admin" htmlFor="er-user">
              <Select id="er-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.email})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="er-reason" hint="Shown to the school.">
              <Textarea
                id="er-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Principal called: admin forgot password and email is not set up"
              />
            </Field>
            <Field label='Type "RESET" to confirm' htmlFor="er-confirm">
              <Input id="er-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
