'use client';

import { useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';

// ── Plans ───────────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  maxStudents: number | null;
  maxStaff: number | null;
  active: boolean;
};

export function PlanForm({ plan, label }: { plan?: Plan; label: string }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [f, setF] = useState({
    name: plan?.name ?? '',
    priceMonthly: String(plan?.priceMonthly ?? 0),
    maxStudents: plan?.maxStudents ? String(plan.maxStudents) : '',
    maxStaff: plan?.maxStaff ? String(plan.maxStaff) : '',
    active: plan?.active ?? true,
  });
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: f.name,
      priceMonthly: Number(f.priceMonthly) || 0,
      maxStudents: num(f.maxStudents),
      maxStaff: num(f.maxStaff),
      active: f.active,
    };
    const r = await run(
      plan ? `/platform/plans/${plan.id}` : '/platform/plans',
      { method: plan ? 'PUT' : 'POST', body },
      plan ? 'Plan saved' : 'Plan created',
    );
    if (r) setOpen(false);
  }
  return (
    <>
      <Button size="sm" variant={plan ? 'ghost' : 'primary'} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={plan ? `Edit ${plan.name}` : 'New plan'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="plan-form" disabled={busy}>
              Save
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" htmlFor="pl-name">
              <Input id="pl-name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Price per month (PKR)" htmlFor="pl-price">
            <Input
              id="pl-price"
              type="number"
              min={0}
              value={f.priceMonthly}
              onChange={(e) => setF({ ...f, priceMonthly: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              checked={f.active}
              onChange={(e) => setF({ ...f, active: e.target.checked })}
              className="size-4"
            />{' '}
            Offered to new schools
          </label>
          <Field label="Max students" htmlFor="pl-st" hint="Empty = no limit">
            <Input
              id="pl-st"
              type="number"
              min={1}
              value={f.maxStudents}
              onChange={(e) => setF({ ...f, maxStudents: e.target.value })}
            />
          </Field>
          <Field label="Max staff accounts" htmlFor="pl-sf" hint="Empty = no limit">
            <Input
              id="pl-sf"
              type="number"
              min={1}
              value={f.maxStaff}
              onChange={(e) => setF({ ...f, maxStaff: e.target.value })}
            />
          </Field>
          {error && <p className="text-sm text-red-700 sm:col-span-2">{error.message}</p>}
        </form>
      </Modal>
    </>
  );
}

export function SubscriptionForm({
  tenantId,
  plans,
  current,
}: {
  tenantId: string;
  plans: { id: string; name: string; active: boolean }[];
  current: { planId: string; status: string; renewsOn: string | null; notes: string | null } | null;
}) {
  const { run, busy } = useAction();
  const [f, setF] = useState({
    planId: current?.planId ?? plans.find((p) => p.active)?.id ?? '',
    status: current?.status ?? 'TRIAL',
    renewsOn: current?.renewsOn ?? '',
    notes: current?.notes ?? '',
  });
  if (!plans.length) return <p className="text-sm text-slate-500">Create a plan first (Plans page).</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          `/platform/tenants/${tenantId}/subscription`,
          {
            method: 'PUT',
            body: { planId: f.planId, status: f.status, renewsOn: f.renewsOn || null, notes: f.notes || null },
          },
          'Subscription saved',
        );
      }}
    >
      <Field label="Plan" htmlFor="sub-plan">
        <Select id="sub-plan" value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.active ? '' : ' (retired)'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status" htmlFor="sub-status">
        <Select id="sub-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="TRIAL">Trial</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST_DUE">Payment overdue</option>
          <option value="CANCELLED">Cancelled (blocks new students/staff)</option>
        </Select>
      </Field>
      <Field label="Renews on" htmlFor="sub-renew">
        <Input
          id="sub-renew"
          type="date"
          value={f.renewsOn}
          onChange={(e) => setF({ ...f, renewsOn: e.target.value })}
        />
      </Field>
      <Field label="Notes" htmlFor="sub-notes">
        <Input id="sub-notes" value={f.notes} maxLength={500} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          Save subscription
        </Button>
      </div>
    </form>
  );
}

// ── Platform admins ─────────────────────────────────────────────────────────

type Grantable = { permission: string; label: string };

export function NewAdminButton({ grantable }: { grantable: Grantable[] }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [f, setF] = useState({ displayName: '', email: '', permissions: [] as string[] });
  const { run, busy, error } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add Platform Admin</Button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setCreated(null);
        }}
        title={created ? 'Platform Admin created' : 'Add Platform Admin'}
        description={
          created
            ? 'This password is shown once. They must change it at first sign-in.'
            : 'They never see school data unless a school approves a support request.'
        }
        footer={
          created ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <Button
              disabled={busy}
              onClick={async () => {
                const r = await run<{ admin: { email: string; temporaryPassword: string } }>(
                  '/platform/admins',
                  { body: f },
                  'Platform Admin created',
                );
                if (r) {
                  setCreated(r.admin);
                  setF({ displayName: '', email: '', permissions: [] });
                }
              }}
            >
              Create
            </Button>
          )
        }
      >
        {created ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-4">
            <p className="text-sm text-slate-600">Sign in at /platform/login</p>
            <p className="font-mono">{created.email}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{created.temporaryPassword}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="Name" htmlFor="pa-name">
              <Input id="pa-name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
            </Field>
            <Field label="Email" htmlFor="pa-email">
              <Input
                id="pa-email"
                type="email"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </Field>
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-sm font-medium text-slate-700">They can</legend>
              {grantable.map((g) => (
                <label key={g.permission} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={f.permissions.includes(g.permission)}
                    onChange={(e) =>
                      setF({
                        ...f,
                        permissions: e.target.checked
                          ? [...f.permissions, g.permission]
                          : f.permissions.filter((p) => p !== g.permission),
                      })
                    }
                  />
                  {g.label}
                </label>
              ))}
            </fieldset>
            {error && <p className="text-sm text-red-700">{error.message}</p>}
          </div>
        )}
      </Modal>
    </>
  );
}

export function AdminRow({
  admin,
  grantable,
}: {
  admin: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    permissions: string[];
    lastLoginAt: string | Date | null;
  };
  grantable: Grantable[];
}) {
  const { run, busy } = useAction();
  const [pw, setPw] = useState<string | null>(null);
  const toggle = (perm: string, on: boolean) =>
    run(
      `/platform/admins/${admin.id}`,
      {
        method: 'PATCH',
        body: { permissions: on ? [...admin.permissions, perm] : admin.permissions.filter((p) => p !== perm) },
      },
      'Access updated',
    );
  return (
    <li className="rounded-2xl bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {admin.displayName} {admin.status !== 'ACTIVE' && <Badge tone="red">Disabled</Badge>}
          </p>
          <p className="text-sm text-slate-500">
            {admin.email} ·{' '}
            {admin.lastLoginAt
              ? `last in ${new Date(admin.lastLoginAt).toLocaleDateString('en-GB')}`
              : 'never signed in'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () =>
              setPw(
                (
                  await run<{ temporaryPassword: string }>(
                    `/platform/admins/${admin.id}/reset-password`,
                    { method: 'POST' },
                    'Password reset',
                  )
                )?.temporaryPassword ?? null,
              )
            }
          >
            Reset password
          </Button>
          <Button
            size="sm"
            variant={admin.status === 'ACTIVE' ? 'danger-ghost' : 'secondary'}
            disabled={busy}
            onClick={() =>
              run(
                `/platform/admins/${admin.id}`,
                { method: 'PATCH', body: { status: admin.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } },
                'Account updated',
              )
            }
          >
            {admin.status === 'ACTIVE' ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>
      {pw && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 font-mono text-sm">New temporary password: {pw}</p>}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <p className="text-sm text-slate-500 sm:col-span-2">Always: view system health.</p>
        {grantable.map((g) => (
          <label key={g.permission} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              disabled={busy}
              checked={admin.permissions.includes(g.permission)}
              onChange={(e) => toggle(g.permission, e.target.checked)}
              aria-label={`${admin.displayName}: ${g.label}`}
            />
            {g.label}
          </label>
        ))}
      </div>
    </li>
  );
}

// ── Tickets ─────────────────────────────────────────────────────────────────

export function ReplyForm({ endpoint, platform }: { endpoint: string; platform?: boolean }) {
  const [body, setBody] = useState('');
  const { run, busy } = useAction();
  const send = async (close: boolean) => {
    const r = await run(
      endpoint,
      { body: platform ? { body, close } : { body } },
      close ? 'Replied and closed' : 'Reply sent',
    );
    if (r) setBody('');
  };
  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply"
        aria-label="Reply"
      />
      <div className="flex gap-2">
        <Button disabled={busy || !body.trim()} onClick={() => send(false)}>
          Send reply
        </Button>
        {platform && (
          <Button variant="secondary" disabled={busy || !body.trim()} onClick={() => send(true)}>
            Reply and close
          </Button>
        )}
      </div>
    </div>
  );
}

export function OwnerDecision({ id }: { id: string }) {
  const { run, busy } = useAction();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={busy}
        onClick={() =>
          run(
            `/platform/support-requests/${id}`,
            { body: { decision: 'APPROVE' } },
            'Approved — the school decides next',
          )
        }
      >
        Approve
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => run(`/platform/support-requests/${id}`, { body: { decision: 'DENY' } }, 'Denied')}
      >
        Deny
      </Button>
    </div>
  );
}
