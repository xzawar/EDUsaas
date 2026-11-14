'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { MoneyInput, Money } from '@/components/finance/shared';
import { toRupees, toPaisa } from '@/lib/money';

type Head = { id: string; name: string; kind: 'MONTHLY' | 'TERM' | 'ONCE'; archivedAt: string | null };
const KIND: Record<string, string> = { MONTHLY: 'Every month', TERM: 'Each term', ONCE: 'One time' };

export function FeeHeadsEditor({ heads }: { heads: Head[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Head['kind']>('MONTHLY');
  const { run, busy } = useAction();
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run('/fees/heads', { body: { name, kind } }, 'Fee head added')) {
      setOpen(false);
      setName('');
    }
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100">
        {heads.map((h) => (
          <li key={h.id} className="flex items-center justify-between gap-3 py-2">
            <span>
              <span className="font-medium">{h.name}</span>{' '}
              <span className="ml-2 text-xs text-slate-500">{KIND[h.kind]}</span>
              {h.archivedAt && <Badge>Archived</Badge>}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(`/fees/heads/${h.id}`, { method: 'PATCH', body: { archived: !h.archivedAt } }, 'Updated')
              }
            >
              {h.archivedAt ? 'Bring back' : 'Archive'}
            </Button>
          </li>
        ))}
        {heads.length === 0 && <li className="py-2 text-sm text-slate-500">No fee heads yet. Start with Tuition.</li>}
      </ul>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add fee head
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a fee head"
        description="A fee head is one line on the bill, e.g. Tuition, Transport, Exam."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || name.trim().length < 2} onClick={submit}>
              Add
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="fh-name">
            <Input
              id="fh-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tuition"
            />
          </Field>
          <Field label="Charged" htmlFor="fh-kind">
            <Select id="fh-kind" value={kind} onChange={(e) => setKind(e.target.value as Head['kind'])}>
              <option value="MONTHLY">Every month</option>
              <option value="TERM">Each term (first month of the term)</option>
              <option value="ONCE">One time (e.g. admission)</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}

type Structure = {
  year: { id: string; name: string };
  classes: { id: string; name: string }[];
  heads: { id: string; name: string; kind: string }[];
  amounts: Record<string, Record<string, number>>;
};

/** Grid of class × fee head. Type rupees; empty = that class doesn't pay that head. */
export function FeeStructureGrid({
  structure,
  years,
}: {
  structure: Structure;
  years: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [text, setText] = useState<Record<string, string>>(() => {
    const t: Record<string, string> = {};
    for (const c of structure.classes)
      for (const h of structure.heads)
        t[`${c.id}:${h.id}`] = structure.amounts[c.id]?.[h.id] ? toRupees(structure.amounts[c.id]![h.id]!) : '';
    return t;
  });
  const [fill, setFill] = useState<Record<string, string>>({});
  const { run, busy } = useAction();
  const others = years.filter((y) => y.id !== structure.year.id);
  const [copyFrom, setCopyFrom] = useState(others[0]?.id ?? '');

  async function save() {
    const rows: { classId: string; feeHeadId: string; amountPaisa: number }[] = [];
    for (const c of structure.classes)
      for (const h of structure.heads) {
        const v = text[`${c.id}:${h.id}`]?.trim() ?? '';
        let paisa = 0;
        try {
          paisa = v === '' ? 0 : toPaisa(v);
        } catch {
          alert(`Check the amount for class ${c.name}, ${h.name}.`);
          return;
        }
        if (paisa !== (structure.amounts[c.id]?.[h.id] ?? 0))
          rows.push({ classId: c.id, feeHeadId: h.id, amountPaisa: paisa });
      }
    if (!rows.length) return;
    await run(`/fees/structures?yearId=${structure.year.id}`, { method: 'PUT', body: { rows } }, 'Fee amounts saved');
    router.refresh();
  }

  if (!structure.heads.length) return <p className="text-sm text-slate-500">Add fee heads first.</p>;
  if (!structure.classes.length) return <p className="text-sm text-slate-500">This year has no classes yet.</p>;
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-2 pr-4">Class</th>
              {structure.heads.map((h) => (
                <th key={h.id} className="py-2 pr-4">
                  {h.name}
                  <span className="block text-[10px] font-normal normal-case">{KIND[h.kind]}</span>
                </th>
              ))}
            </tr>
            <tr>
              <td className="py-1 pr-4 text-xs text-slate-400">Fill all ↓</td>
              {structure.heads.map((h) => (
                <td key={h.id} className="py-1 pr-4">
                  <Input
                    aria-label={`Fill every class for ${h.name}`}
                    className="h-8 w-28 text-right"
                    placeholder="e.g. 3500"
                    value={fill[h.id] ?? ''}
                    onChange={(e) => setFill({ ...fill, [h.id]: e.target.value })}
                    onBlur={() => {
                      const v = fill[h.id]?.trim();
                      if (!v) return;
                      const next = { ...text };
                      for (const c of structure.classes) next[`${c.id}:${h.id}`] = v;
                      setText(next);
                    }}
                  />
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {structure.classes.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-4 font-medium">Class {c.name}</td>
                {structure.heads.map((h) => (
                  <td key={h.id} className="py-1.5 pr-4">
                    <Input
                      aria-label={`Class ${c.name} ${h.name}`}
                      inputMode="decimal"
                      className="h-8 w-28 text-right tabular-nums"
                      value={text[`${c.id}:${h.id}`] ?? ''}
                      onChange={(e) => setText({ ...text, [`${c.id}:${h.id}`]: e.target.value })}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save amounts'}
        </Button>
        {others.length > 0 && (
          <span className="flex items-center gap-2 text-sm">
            <Select
              aria-label="Copy from year"
              className="h-9"
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              {others.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={busy || !copyFrom}
              onClick={async () => {
                if (
                  await run(
                    `/fees/structures?yearId=${structure.year.id}`,
                    { body: { fromYearId: copyFrom } },
                    'Amounts copied',
                  )
                )
                  router.refresh();
              }}
            >
              Copy from that year
            </Button>
          </span>
        )}
      </div>
    </div>
  );
}

type Rule = { graceDays: number; kind: 'FIXED' | 'PERCENT' | 'PER_DAY'; value: number; capPaisa: number | null } | null;

export function LateFeeEditor({ yearId, rule }: { yearId: string; rule: Rule }) {
  const [kind, setKind] = useState<NonNullable<Rule>['kind']>(rule?.kind ?? 'FIXED');
  const [grace, setGrace] = useState(rule?.graceDays ?? 5);
  const [amount, setAmount] = useState<number | null>(rule && rule.kind !== 'PERCENT' ? rule.value : null);
  const [percent, setPercent] = useState(rule && rule.kind === 'PERCENT' ? String(rule.value / 100) : '5');
  const [cap, setCap] = useState<number | null>(rule?.capPaisa ?? null);
  const { run, busy } = useAction();
  async function save(e: FormEvent) {
    e.preventDefault();
    const value = kind === 'PERCENT' ? Math.round(Number(percent) * 100) : (amount ?? 0);
    await run(
      `/fees/late-fee?yearId=${yearId}`,
      { method: 'PUT', body: { graceDays: grace, kind, value, capPaisa: cap } },
      'Late-fee rule saved',
    );
  }
  return (
    <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <Field label="Grace period (days after due date)" htmlFor="lf-grace">
        <Input
          id="lf-grace"
          type="number"
          min={0}
          max={90}
          value={grace}
          onChange={(e) => setGrace(Number(e.target.value))}
        />
      </Field>
      <Field label="Late fee is" htmlFor="lf-kind">
        <Select id="lf-kind" value={kind} onChange={(e) => setKind(e.target.value as NonNullable<Rule>['kind'])}>
          <option value="FIXED">A fixed amount</option>
          <option value="PERCENT">A percent of the bill</option>
          <option value="PER_DAY">An amount per late day</option>
        </Select>
      </Field>
      {kind === 'PERCENT' ? (
        <Field label="Percent of the bill" htmlFor="lf-pct">
          <Input
            id="lf-pct"
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </Field>
      ) : (
        <Field label={kind === 'PER_DAY' ? 'Amount per late day' : 'Amount'} htmlFor="lf-amount">
          <MoneyInput id="lf-amount" valuePaisa={amount} onChange={setAmount} />
        </Field>
      )}
      <Field label="Never more than (optional)" htmlFor="lf-cap">
        <MoneyInput id="lf-cap" valuePaisa={cap} onChange={setCap} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy || (kind !== 'PERCENT' && amount === null)}>
          Save rule
        </Button>
        {rule && (
          <span className="ml-3 text-sm text-slate-500">
            Current: after {rule.graceDays} days,{' '}
            {rule.kind === 'PERCENT' ? `${rule.value / 100}%` : <Money paisa={rule.value} />}
            {rule.kind === 'PER_DAY' ? ' per day' : ''}
            {rule.capPaisa ? (
              <>
                {' '}
                (max <Money paisa={rule.capPaisa} />)
              </>
            ) : null}
          </span>
        )}
      </div>
    </form>
  );
}
