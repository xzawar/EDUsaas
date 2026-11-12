'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ConfirmButton, Modal, useAction } from '@/components/overlay';
import { Alert, Badge, Button, Field, Input, ROLE_LABELS, Select, Table, Td, Th } from '@/components/ui';
import { MethodSelect, Money, MoneyInput, fmtDate } from '@/components/finance/shared';
import { periodLabel } from '@/lib/periods';

type Line = { name: string; amountPaisa: number };
type Roster = {
  id: string;
  name: string;
  role: string;
  status: string;
  netPaisa: number | null;
  effectiveFrom: string | null;
}[];

function LinesEditor({ label, lines, onChange }: { label: string; lines: Line[]; onChange: (l: Line[]) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input
            aria-label={`${label} name`}
            placeholder="Name"
            value={l.name}
            onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <div className="w-40">
            <MoneyInput
              id={`${label}-${i}`}
              valuePaisa={l.amountPaisa}
              onChange={(p) => onChange(lines.map((x, j) => (j === i ? { ...x, amountPaisa: p ?? 0 } : x)))}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Remove"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...lines, { name: '', amountPaisa: 0 }])}
      >
        <Plus className="size-4" /> Add {label.toLowerCase()}
      </Button>
    </div>
  );
}

export function SalaryRoster({ roster, today }: { roster: Roster; today: string }) {
  const [editing, setEditing] = useState<Roster[number] | null>(null);
  return (
    <>
      <Table>
        <thead>
          <tr>
            <Th>Staff</Th>
            <Th>Role</Th>
            <Th className="text-right">Monthly net</Th>
            <Th>Since</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {roster.map((u) => (
            <tr key={u.id} className={u.status !== 'ACTIVE' ? 'text-slate-400' : ''}>
              <Td className="font-medium">{u.name}</Td>
              <Td>{ROLE_LABELS[u.role] ?? u.role}</Td>
              <Td className="text-right">
                {u.netPaisa === null ? <Badge tone="amber">Not set</Badge> : <Money paisa={u.netPaisa} />}
              </Td>
              <Td>{u.effectiveFrom ? fmtDate(u.effectiveFrom) : '—'}</Td>
              <Td className="text-right">
                <Button size="sm" variant="secondary" onClick={() => setEditing(u)}>
                  {u.netPaisa === null ? 'Set salary' : 'Edit'}
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {editing && <SalaryEditor user={editing} today={today} onClose={() => setEditing(null)} />}
    </>
  );
}

function SalaryEditor({ user, today, onClose }: { user: Roster[number]; today: string; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [basic, setBasic] = useState<number | null>(null);
  const [allowances, setAllowances] = useState<Line[]>([]);
  const [deductions, setDeductions] = useState<Line[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [perDay, setPerDay] = useState<'BASIC_30' | 'NONE'>('BASIC_30');
  const { run, busy, error } = useAction();
  if (!loaded) {
    setLoaded(true);
    void fetch(`/api/v1/payroll/structures/${user.id}`, { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((j) => {
        const s = j.structure;
        if (!s) return;
        setBasic(s.basicPaisa);
        setAllowances(s.allowances);
        setDeductions(s.deductions);
        setEffectiveFrom(s.effectiveFrom);
        setPerDay(s.perDayDeduction);
      });
  }
  const net =
    (basic ?? 0) +
    allowances.reduce((a, l) => a + l.amountPaisa, 0) -
    deductions.reduce((a, l) => a + l.amountPaisa, 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run(
      `/payroll/structures/${user.id}`,
      {
        method: 'PUT',
        body: {
          basicPaisa: basic ?? 0,
          allowances: allowances.filter((l) => l.name.trim()),
          deductions: deductions.filter((l) => l.name.trim()),
          effectiveFrom,
          perDayDeduction: perDay,
        },
      },
      'Salary saved',
    );
    if (r) {
      onClose();
      router.refresh();
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Salary: ${user.name}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || basic === null} onClick={submit}>
            {busy ? 'Saving…' : 'Save salary'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error.message}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Basic salary (monthly)" htmlFor="sal-basic">
            <MoneyInput id="sal-basic" valuePaisa={basic} onChange={setBasic} autoFocus />
          </Field>
          <Field label="Effective from" htmlFor="sal-from">
            <Input id="sal-from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
        </div>
        <LinesEditor label="Allowances" lines={allowances} onChange={setAllowances} />
        <LinesEditor label="Deductions" lines={deductions} onChange={setDeductions} />
        <Field label="Unpaid leave" htmlFor="sal-perday" hint="How approved unpaid leave reduces the month's pay.">
          <Select id="sal-perday" value={perDay} onChange={(e) => setPerDay(e.target.value as 'BASIC_30' | 'NONE')}>
            <option value="BASIC_30">Deduct basic ÷ 30 per day</option>
            <option value="NONE">No deduction</option>
          </Select>
        </Field>
        <p className="text-sm text-slate-600">
          Net per month: <Money paisa={net} className="font-semibold text-slate-900" />
        </p>
      </form>
    </Modal>
  );
}

export function NewRunButton({ month }: { month: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState(month);
  const { run, busy, error } = useAction();
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New payroll
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Run payroll"
        description="Makes a draft payslip for everyone with a salary. You review it, then finalise and pay."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const r = await run<{ id: string }>('/payroll/runs', { body: { period } }, 'Draft payroll created');
                if (r) router.push(`/staff/finance/payroll/${r.id}`);
              }}
            >
              Create draft
            </Button>
          </>
        }
      >
        {error && <Alert>{error.message}</Alert>}
        <Field label="Month" htmlFor="run-period">
          <Select id="run-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {periodLabel(m)}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </>
  );
}

export function RunActions({
  id,
  status,
  unpaid,
  today,
}: {
  id: string;
  status: string;
  unpaid: number;
  today: string;
}) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState('BANK');
  const [reference, setReference] = useState('');
  const { run, busy } = useAction();
  return (
    <>
      {status === 'DRAFT' && (
        <>
          <ConfirmButton
            variant="danger-ghost"
            label="Delete draft"
            title="Delete this draft payroll?"
            message="Nothing has been paid. You can run it again later."
            confirmLabel="Delete"
            onConfirm={async () => {
              const r = await run(`/payroll/runs/${id}`, { method: 'DELETE' }, 'Draft deleted');
              if (r) router.push('/staff/finance/payroll');
            }}
          />
          <ConfirmButton
            variant="primary"
            tone="primary"
            label="Finalise"
            title="Finalise this payroll?"
            message="Amounts lock and every staff member gets their payslip. You then mark them paid."
            confirmLabel="Finalise"
            onConfirm={() => run(`/payroll/runs/${id}/finalise`, { method: 'POST' }, 'Payroll finalised')}
          />
        </>
      )}
      {status === 'FINALISED' && unpaid > 0 && <Button onClick={() => setPaying(true)}>Mark all paid</Button>}
      <Modal
        open={paying}
        onClose={() => setPaying(false)}
        title="Mark salaries paid"
        description={`${unpaid} payslip${unpaid === 1 ? '' : 's'} will be marked paid and recorded as an expense.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const r = await run(
                  `/payroll/runs/${id}/pay`,
                  { body: { paidOn, method, reference: reference || undefined } },
                  'Salaries marked paid',
                );
                if (r) setPaying(false);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Paid on" htmlFor="pay-on">
            <Input id="pay-on" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Paid by" htmlFor="pay-method">
            <MethodSelect id="pay-method" value={method} onChange={setMethod} />
          </Field>
          <Field label="Reference (optional)" htmlFor="pay-ref">
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank batch no."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
