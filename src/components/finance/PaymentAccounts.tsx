'use client';

import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Badge, Button, Field, Input, Select } from '@/components/ui';

export type Account = {
  id: string;
  method: 'BANK' | 'JAZZCASH' | 'EASYPAISA';
  label: string;
  accountTitle: string;
  accountNumber: string;
  iban: string | null;
  active: boolean;
};
const METHOD: Record<Account['method'], string> = { BANK: 'Bank', JAZZCASH: 'JazzCash', EASYPAISA: 'Easypaisa' };
const blank = { method: 'BANK' as Account['method'], label: '', accountTitle: '', accountNumber: '', iban: '' };

/** Where parents pay: shown to students under "Paid by" when they send a payment screenshot. */
export function PaymentAccountsEditor({ accounts }: { accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const { run, busy } = useAction();
  function open(a: Account | 'new') {
    setEditing(a);
    setF(a === 'new' ? blank : { ...a, iban: a.iban ?? '' });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...f, active: editing === 'new' ? true : (editing as Account).active };
    const ok =
      editing === 'new'
        ? await run('/fees/accounts', { body }, 'Account added')
        : await run(`/fees/accounts/${(editing as Account).id}`, { method: 'PATCH', body }, 'Saved');
    if (ok) setEditing(null);
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100">
        {accounts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <span>
              <span className="font-semibold">{a.label}</span>
              <span className="ml-2 text-sm text-slate-500">
                {a.accountTitle} · {a.accountNumber}
              </span>
              {!a.active && <Badge>Hidden</Badge>}
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => open(a)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    `/fees/accounts/${a.id}`,
                    { method: 'PATCH', body: { ...a, iban: a.iban ?? '', active: !a.active } },
                    a.active ? 'Hidden from parents' : 'Shown to parents',
                  )
                }
              >
                {a.active ? 'Hide' : 'Show'}
              </Button>
            </span>
          </li>
        ))}
        {accounts.length === 0 && (
          <li className="py-2 text-sm text-slate-500">No accounts yet. Add your bank account first.</li>
        )}
      </ul>
      <Button variant="secondary" onClick={() => open('new')}>
        <Plus className="size-4" /> Add account
      </Button>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add an account' : 'Edit account'}
        description="Parents see this when they pay by transfer."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={busy || f.label.trim().length < 2 || f.accountNumber.trim().length < 4} onClick={submit}>
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Type" htmlFor="pa-method">
            <Select
              id="pa-method"
              value={f.method}
              onChange={(e) => {
                const method = e.target.value as Account['method'];
                setF({ ...f, method, label: method === 'BANK' ? f.label : METHOD[method] });
              }}
            >
              {Object.entries(METHOD).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={f.method === 'BANK' ? 'Bank name' : 'Name'} htmlFor="pa-label">
            <Input id="pa-label" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          </Field>
          <Field label="Account title" htmlFor="pa-title">
            <Input
              id="pa-title"
              value={f.accountTitle}
              onChange={(e) => setF({ ...f, accountTitle: e.target.value })}
            />
          </Field>
          <Field label={f.method === 'BANK' ? 'Account number' : 'Mobile number'} htmlFor="pa-number">
            <Input
              id="pa-number"
              value={f.accountNumber}
              onChange={(e) => setF({ ...f, accountNumber: e.target.value })}
            />
          </Field>
          {f.method === 'BANK' && (
            <Field label="IBAN (optional)" htmlFor="pa-iban">
              <Input id="pa-iban" value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} />
            </Field>
          )}
        </form>
      </Modal>
    </div>
  );
}
