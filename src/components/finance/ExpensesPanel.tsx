'use client';

import { Plus, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmButton, FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Alert, Badge, Button, Field, Input, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { METHOD_LABELS, MethodSelect, Money, MoneyInput, fmtDate, useClientKey } from '@/components/finance/shared';

type Category = { id: string; name: string; system: boolean; archivedAt: string | null };
type Expense = {
  id: string;
  voucherNumber: string;
  category: string;
  amountPaisa: number;
  spentOn: string;
  paidTo: string;
  method: string;
  reference: string | null;
  note: string | null;
  hasReceipt: boolean;
  reversed: boolean;
  isReversal: boolean;
  reversalReason: string | null;
};

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function NewExpenseButton({ categories, today }: { categories: Category[]; today: string }) {
  const active = categories.filter((c) => !c.archivedAt && !c.system);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({
    categoryId: active[0]?.id ?? '',
    paidTo: '',
    method: 'CASH',
    reference: '',
    spentOn: today,
    note: '',
  });
  const [amount, setAmount] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<string | undefined>();
  const [fileErr, setFileErr] = useState('');
  const { key, reset } = useClientKey();
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (amount === null) return;
    const r = await run(
      '/expenses',
      {
        body: {
          ...v,
          reference: v.reference || undefined,
          note: v.note || undefined,
          amountPaisa: amount,
          clientKey: key,
          receipt,
        },
      },
      'Expense recorded',
    );
    if (r) {
      setOpen(false);
      setAmount(null);
      setReceipt(undefined);
      setV({ ...v, paidTo: '', reference: '', note: '' });
      reset();
    }
  }
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!active.length}
        title={active.length ? undefined : 'Add a category first'}
      >
        <Plus className="size-4" /> Record expense
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record an expense"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || amount === null || v.paidTo.trim().length < 2} onClick={submit}>
              {busy ? 'Saving…' : 'Save voucher'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && !Object.keys(errors).length && <Alert>{error.message}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="ex-cat">
              <Select id="ex-cat" value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}>
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" htmlFor="ex-amount">
              <MoneyInput id="ex-amount" valuePaisa={amount} onChange={setAmount} min={1} autoFocus />
              <FieldError message={errors.amountPaisa} />
            </Field>
          </div>
          <Field label="Paid to" htmlFor="ex-paidto">
            <Input
              id="ex-paidto"
              value={v.paidTo}
              onChange={(e) => setV({ ...v, paidTo: e.target.value })}
              placeholder="e.g. LESCO, Book Depot"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paid by" htmlFor="ex-method">
              <MethodSelect id="ex-method" value={v.method} onChange={(method) => setV({ ...v, method })} />
            </Field>
            <Field label="Date" htmlFor="ex-date">
              <Input
                id="ex-date"
                type="date"
                max={today}
                value={v.spentOn}
                onChange={(e) => setV({ ...v, spentOn: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reference / bill no. (optional)" htmlFor="ex-ref">
            <Input id="ex-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
          </Field>
          <Field label="Photo of the bill (optional, ≤ 300 KB)" htmlFor="ex-file">
            <input
              id="ex-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setFileErr('');
                if (!f) return setReceipt(undefined);
                if (f.size > 300 * 1024) return setFileErr('That photo is over 300 KB. Take a smaller one.');
                setReceipt(await fileToBase64(f));
              }}
            />
            {fileErr && <p className="text-xs text-red-600">{fileErr}</p>}
          </Field>
          <Field label="Note (optional)" htmlFor="ex-note">
            <Textarea id="ex-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </>
  );
}

export function ExpenseTable({ items }: { items: Expense[] }) {
  const { run } = useAction();
  const [reason, setReason] = useState('');
  if (!items.length) return <p className="py-6 text-center text-sm text-slate-500">No expenses in this range.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Voucher</Th>
          <Th>Date</Th>
          <Th>Category</Th>
          <Th>Paid to</Th>
          <Th>By</Th>
          <Th className="text-right">Amount</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {items.map((e) => (
          <tr key={e.id} className={e.reversed ? 'text-slate-400 line-through' : ''}>
            <Td className="font-medium">
              {e.voucherNumber}
              {e.isReversal && <Badge tone="red">reversal</Badge>}
            </Td>
            <Td>{fmtDate(e.spentOn)}</Td>
            <Td>{e.category}</Td>
            <Td>
              {e.paidTo}
              {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
              {e.reversalReason && <span className="block text-xs text-slate-500">{e.reversalReason}</span>}
            </Td>
            <Td>
              {METHOD_LABELS[e.method] ?? e.method}
              {e.reference && <span className="block font-mono text-xs text-slate-500">{e.reference}</span>}
            </Td>
            <Td className="text-right">
              <Money paisa={e.amountPaisa} />
            </Td>
            <Td className="text-right whitespace-nowrap">
              {e.hasReceipt && (
                <a
                  href={`/api/v1/expenses/${e.id}/receipt`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm text-link hover:underline"
                >
                  Bill
                </a>
              )}
              {!e.reversed && !e.isReversal && (
                <ConfirmButton
                  variant="ghost"
                  size="sm"
                  label={
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Undo2 className="size-3.5" /> Reverse
                    </span>
                  }
                  title={`Reverse voucher ${e.voucherNumber}?`}
                  message={
                    <div className="space-y-3">
                      <p>The voucher stays on record, marked reversed, and the money comes back into the books.</p>
                      <Textarea
                        aria-label="Reason"
                        placeholder="Why?"
                        value={reason}
                        onChange={(ev) => setReason(ev.target.value)}
                      />
                    </div>
                  }
                  confirmLabel="Reverse"
                  onConfirm={() => run(`/expenses/${e.id}/reverse`, { body: { reason } }, 'Expense reversed')}
                />
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const [name, setName] = useState('');
  const { run, busy } = useAction();
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ${c.archivedAt ? 'text-slate-400 ring-slate-200' : 'ring-slate-300'}`}
          >
            {c.name}
            {c.system ? (
              <span className="text-xs text-slate-400">auto</span>
            ) : (
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-900"
                disabled={busy}
                onClick={() =>
                  run(`/expenses/categories/${c.id}`, { method: 'PATCH', body: { archived: !c.archivedAt } }, 'Updated')
                }
              >
                {c.archivedAt ? 'restore' : '×'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run('/expenses/categories', { body: { name } }, 'Category added')) setName('');
        }}
      >
        <Input
          aria-label="New category"
          placeholder="New category, e.g. Utilities"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary" disabled={busy || name.trim().length < 2}>
          Add
        </Button>
      </form>
    </div>
  );
}
