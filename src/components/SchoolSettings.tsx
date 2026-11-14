'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { Alert, Button, Field, Input, ROLE_LABELS, Select } from '@/components/ui';
import type { PermissionMatrix } from '@/server/school/settings';

type Settings = {
  timezone: string;
  attendanceMode: 'ONCE_DAILY' | 'PER_PERIOD';
  atRiskThreshold: number;
  marksPublisher: 'SCHOOL_ADMIN' | 'PRINCIPAL';
  leaveAgeOutHours: number;
  invoiceDay: number;
  feeDueDays: number;
  receiptFooter: string | null;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = (Object.keys(values) as (keyof Settings)[]).filter((k) => values[k] !== saved[k]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const body = Object.fromEntries(dirty.map((k) => [k, values[k]]));
    const res = await api<{ settings: Settings }>('/settings', { method: 'PATCH', body });
    setBusy(false);
    if (res.ok) {
      setSaved(values);
      setStatus({ tone: 'success', text: 'Settings saved.' });
    } else setStatus({ tone: 'error', text: res.error.message });
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Timezone" htmlFor="timezone" hint="Attendance dates and correction windows use this timezone.">
          <Input id="timezone" value={values.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </Field>
        <Field
          label="Attendance mode"
          htmlFor="attendanceMode"
          hint="Once daily = one register per day (first period)."
        >
          <Select
            id="attendanceMode"
            value={values.attendanceMode}
            onChange={(e) => set('attendanceMode', e.target.value as Settings['attendanceMode'])}
          >
            <option value="ONCE_DAILY">Once daily</option>
            <option value="PER_PERIOD">Every period</option>
          </Select>
        </Field>
        <Field
          label="At-risk attendance threshold (%)"
          htmlFor="atRiskThreshold"
          hint="Students below this get flagged on dashboards."
        >
          <Input
            id="atRiskThreshold"
            type="number"
            min={0}
            max={100}
            value={values.atRiskThreshold}
            onChange={(e) => set('atRiskThreshold', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Who publishes marks"
          htmlFor="marksPublisher"
          hint="Marks are visible to students only after publishing."
        >
          <Select
            id="marksPublisher"
            value={values.marksPublisher}
            onChange={(e) => set('marksPublisher', e.target.value as Settings['marksPublisher'])}
          >
            <option value="SCHOOL_ADMIN">School Admin</option>
            <option value="PRINCIPAL">Principal</option>
          </Select>
        </Field>
        <Field
          label="Escalate pending leave after (hours)"
          htmlFor="leaveAgeOutHours"
          hint="Unanswered leave requests move to the School Admin."
        >
          <Input
            id="leaveAgeOutHours"
            type="number"
            min={1}
            max={720}
            value={values.leaveAgeOutHours}
            onChange={(e) => set('leaveAgeOutHours', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Fee bills are issued on day"
          htmlFor="invoiceDay"
          hint="Of each month. Bills for the month are generated automatically on this day."
        >
          <Input
            id="invoiceDay"
            type="number"
            min={1}
            max={28}
            value={values.invoiceDay}
            onChange={(e) => set('invoiceDay', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Fees due within (days)"
          htmlFor="feeDueDays"
          hint="After the bill is issued. The late-fee rule starts after this plus its grace period."
        >
          <Input
            id="feeDueDays"
            type="number"
            min={0}
            max={60}
            value={values.feeDueDays}
            onChange={(e) => set('feeDueDays', Number(e.target.value))}
          />
        </Field>
        <Field
          label="Receipt footer"
          htmlFor="receiptFooter"
          hint="One line printed at the bottom of every fee receipt."
        >
          <Input
            id="receiptFooter"
            value={values.receiptFooter ?? ''}
            onChange={(e) => set('receiptFooter', e.target.value || null)}
            placeholder="e.g. Fees once paid are not refundable."
          />
        </Field>
      </div>
      <Button type="submit" disabled={busy || dirty.length === 0}>
        {busy ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

export function PermissionsMatrix({ initial }: { initial: PermissionMatrix }) {
  const [roles, setRoles] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(role: PermissionMatrix[number]['role'], permission: string, granted: boolean) {
    const key = `${role}:${permission}`;
    setPending(key);
    setError(null);
    const res = await api<{ roles: PermissionMatrix }>('/settings/permissions', {
      method: 'PUT',
      body: { changes: [{ role, permission, granted }] },
    });
    setPending(null);
    if (res.ok) setRoles(res.data.roles);
    else setError(res.error.message);
  }

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        {roles.map((r) => (
          <div key={r.role} className="rounded-lg border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-3 font-semibold">{ROLE_LABELS[r.role]}</h3>
            <ul className="divide-y divide-slate-100">
              {r.configurable.map((p) => {
                const key = `${r.role}:${p.permission}`;
                const id = `perm-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
                return (
                  <li key={p.permission} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <label htmlFor={id} className="text-sm text-slate-700">
                      {p.label}
                    </label>
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      className="size-4 accent-[var(--accent)]"
                      checked={p.granted}
                      disabled={pending === key}
                      onChange={(e) => toggle(r.role, p.permission, e.target.checked)}
                    />
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Always allowed: {r.fixed.map((f) => f.label.toLowerCase()).join(', ')}.
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Changes take effect immediately and are recorded in the audit log.</p>
    </div>
  );
}
