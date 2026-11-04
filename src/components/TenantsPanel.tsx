'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';

type Tenant = {
  id: string;
  name: string;
  prefix: string;
  city: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  userCount: number;
  createdAt: string | Date;
};
type Page = { items: Tenant[]; nextCursor: string | null | undefined };
type Created = { tenant: Tenant; schoolAdmin: { email: string; displayName: string; temporaryPassword: string } };

const STATUS_TONE = { TRIAL: 'blue', ACTIVE: 'green', SUSPENDED: 'red' } as const;

export function TenantsPanel({ initial, canManage }: { initial: Page; canManage: boolean }) {
  const [page, setPage] = useState<Page>(initial);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load(query = q, cursor?: string) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    const res = await api<Page>(`/platform/tenants?${params}`);
    if (res.ok)
      setPage((prev) =>
        cursor ? { items: [...prev.items, ...res.data.items], nextCursor: res.data.nextCursor } : res.data,
      );
    else setError(res.error.message);
  }

  async function setStatus(t: Tenant, status: Tenant['status']) {
    if (
      status === 'SUSPENDED' &&
      !window.confirm(`Suspend ${t.name}? Everyone at this school will be signed out and blocked until reactivated.`)
    )
      return;
    const res = await api<{ tenant: Tenant }>(`/platform/tenants/${t.id}`, { method: 'PATCH', body: { status } });
    if (res.ok)
      setPage((p) => ({
        ...p,
        items: p.items.map((x) => (x.id === t.id ? { ...x, status: res.data.tenant.status } : x)),
      }));
    else setError(res.error.message);
  }

  return (
    <div className="space-y-6">
      {created && (
        <Alert tone="success">
          <p className="font-medium">{created.tenant.name} created.</p>
          <p className="mt-1">
            School Admin sign-in: <span className="font-mono">{created.schoolAdmin.email}</span> · temporary password{' '}
            <span className="font-mono font-semibold">{created.schoolAdmin.temporaryPassword}</span>
          </p>
          <p className="mt-1 text-xs">
            This password is shown once. Share it securely; they must change it at first sign-in.
          </p>
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {canManage && showCreate && (
        <CreateTenantForm
          onCancel={() => setShowCreate(false)}
          onCreated={(c) => {
            setCreated(c);
            setShowCreate(false);
            void load('');
          }}
        />
      )}
      <Card
        title="All schools"
        actions={canManage && !showCreate ? <Button onClick={() => setShowCreate(true)}>Add school</Button> : undefined}
      >
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(q);
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, prefix or city"
            aria-label="Search schools"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">School</th>
                <th className="py-2 pr-4 font-medium">Prefix</th>
                <th className="py-2 pr-4 font-medium">Accounts</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                {canManage && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {page.items.map((t) => (
                <tr key={t.id}>
                  <td className="py-2.5 pr-4">
                    <p className="font-medium">{t.name}</p>
                    {t.city && <p className="text-xs text-slate-500">{t.city}</p>}
                  </td>
                  <td className="py-2.5 pr-4 font-mono">{t.prefix}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{t.userCount}</td>
                  <td className="py-2.5 pr-4">
                    <Badge tone={STATUS_TONE[t.status]}>{t.status.charAt(0) + t.status.slice(1).toLowerCase()}</Badge>
                  </td>
                  {canManage && (
                    <td className="py-2.5 text-right">
                      {t.status === 'SUSPENDED' ? (
                        <Button variant="secondary" onClick={() => setStatus(t, 'ACTIVE')}>
                          Reactivate
                        </Button>
                      ) : (
                        <div className="flex justify-end gap-2">
                          {t.status === 'TRIAL' && (
                            <Button variant="secondary" onClick={() => setStatus(t, 'ACTIVE')}>
                              Activate
                            </Button>
                          )}
                          <Button variant="danger-ghost" onClick={() => setStatus(t, 'SUSPENDED')}>
                            Suspend
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {page.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No schools found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {page.nextCursor && (
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={() => load(q, page.nextCursor ?? undefined)}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function CreateTenantForm({ onCreated, onCancel }: { onCreated: (c: Created) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', prefix: '', city: '', adminName: '', adminEmail: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await api<Created>('/platform/tenants', {
      body: {
        name: form.name,
        prefix: form.prefix,
        city: form.city || undefined,
        admin: { displayName: form.adminName, email: form.adminEmail },
      },
    });
    setBusy(false);
    if (res.ok) onCreated(res.data);
    else setError(res.error.message);
  }

  return (
    <Card title="Add a school" description="Creates the school and its one School Admin account.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="School name" htmlFor="name">
            <Input id="name" value={form.name} onChange={set('name')} required />
          </Field>
          <Field label="Username prefix" htmlFor="prefix" hint="2–10 letters/digits, unique. Can't be changed later.">
            <Input
              id="prefix"
              value={form.prefix}
              onChange={set('prefix')}
              required
              className="font-mono lowercase"
              maxLength={10}
            />
          </Field>
          <Field label="City (optional)" htmlFor="city">
            <Input id="city" value={form.city} onChange={set('city')} />
          </Field>
          <Field label="School Admin name" htmlFor="adminName">
            <Input id="adminName" value={form.adminName} onChange={set('adminName')} required />
          </Field>
          <Field label="School Admin email" htmlFor="adminEmail">
            <Input id="adminEmail" type="email" value={form.adminEmail} onChange={set('adminEmail')} required />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create school'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
