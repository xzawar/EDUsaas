import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { BarList } from '@/components/charts';
import { Money } from '@/components/finance/shared';
import { fmtDate } from '@/lib/finance-format';
import { Card, Select, TabLinks, Table, Td, Th } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { dailyCollection, defaulters, incomeExpense, monthSummary, reportQuery } from '@/server/school/finance/reports';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Money reports' };

function Csv({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
    >
      <Download className="size-4" /> Download CSV
    </a>
  );
}

export default async function MoneyReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF', 'finance.read');
  const sp = await searchParams;
  const tab = ['daily', 'defaulters', 'income', 'summary'].includes(sp.tab ?? '') ? sp.tab! : 'summary';
  const parsed = reportQuery.safeParse(sp);
  const q = parsed.success ? parsed.data : reportQuery.parse({});
  const clock = await inTenant(ctx, (tx) => schoolClock(tx));
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v && k !== 'tab') p.set(k, v);
    return p.toString();
  };
  return (
    <>
      <PageHeader title="Money reports" description="Everything comes from the ledger, so the numbers always add up." />
      <Card>
        <div className="mb-4">
          <TabLinks
            active={tab}
            tabs={[
              { key: 'summary', label: 'Month summary', href: '/staff/finance/reports' },
              { key: 'daily', label: 'Daily collection', href: '/staff/finance/reports?tab=daily' },
              { key: 'defaulters', label: 'Defaulters', href: '/staff/finance/reports?tab=defaulters' },
              { key: 'income', label: 'Income vs expense', href: '/staff/finance/reports?tab=income' },
            ]}
          />
        </div>
        {tab === 'summary' && (
          <SummaryTab
            period={q.period ?? clock.today.slice(0, 7)}
            today={clock.today}
            csv={`/api/v1/finance/reports/summary?${qs({ format: 'csv' })}`}
          />
        )}
        {tab === 'daily' && <DailyTab q={q} csv={`/api/v1/finance/reports/daily?${qs({ format: 'csv' })}`} />}
        {tab === 'defaulters' && (
          <DefaultersTab q={q} csv={`/api/v1/finance/reports/defaulters?${qs({ format: 'csv' })}`} />
        )}
        {tab === 'income' && <IncomeTab csv={`/api/v1/finance/reports/income-expense?format=csv`} />}
      </Card>
    </>
  );
}

async function SummaryTab({ period, today, csv }: { period: string; today: string; csv: string }) {
  const ctx = await requirePortal('STAFF', 'finance.read');
  const r = await monthSummary(ctx, { period, format: 'json' });
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const row = (label: string, v: number, strong = false) => (
    <div className={`flex justify-between py-2 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-slate-600">{label}</span>
      <Money paisa={v} />
    </div>
  );
  return (
    <>
      <form className="mb-4 flex flex-wrap items-center gap-3" action="/staff/finance/reports">
        <Select name="period" defaultValue={period} className="h-9">
          {months.map((m) => (
            <option key={m} value={m}>
              {periodLabel(m)}
            </option>
          ))}
        </Select>
        <button type="submit" className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white">
          Show
        </button>
        <span className="ml-auto">
          <Csv href={csv} />
        </span>
      </form>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="divide-y divide-slate-100">
          {row(`Bills issued (${r.bills})`, r.invoicedPaisa)}
          {row('Discounts given', r.discountPaisa)}
          {row('Collected', r.collectedPaisa, true)}
          {row('Expenses', r.expensesPaisa)}
          {row('Salaries', r.salariesPaisa)}
          {row('Net for the month', r.netPaisa, true)}
          {row('Still owed (all months)', r.outstandingPaisa)}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Spending by category</h3>
          {r.expensesByCategory.length ? (
            <BarList
              caption="Expenses by category this month"
              unit="PKR"
              rows={r.expensesByCategory.map((c) => ({ label: c.category, value: Math.round(c.amountPaisa / 100) }))}
            />
          ) : (
            <p className="text-sm text-slate-500">Nothing spent this month.</p>
          )}
        </div>
      </div>
    </>
  );
}

async function DailyTab({ q, csv }: { q: { from?: string; to?: string }; csv: string }) {
  const ctx = await requirePortal('STAFF', 'finance.read');
  const r = await dailyCollection(ctx, { ...q, format: 'json' });
  return (
    <>
      <form className="mb-4 flex flex-wrap items-end gap-3" action="/staff/finance/reports">
        <input type="hidden" name="tab" value="daily" />
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">From</span>
          <input
            type="date"
            name="from"
            defaultValue={r.from}
            className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-600">To</span>
          <input
            type="date"
            name="to"
            defaultValue={r.to}
            className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
          />
        </label>
        <button type="submit" className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white">
          Show
        </button>
        <span className="ml-auto">
          <Csv href={csv} />
        </span>
      </form>
      <p className="mb-3 text-sm text-slate-600">
        Received <Money paisa={r.totalInPaisa} className="font-semibold text-slate-900" />
        {r.totalOutPaisa > 0 && (
          <>
            {' '}
            · reversed <Money paisa={r.totalOutPaisa} />
          </>
        )}
      </p>
      {r.days.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {r.days.map((d) => (
            <div key={d.day} className="rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
              <span className="block text-xs text-slate-500">{fmtDate(d.day)}</span>
              <Money paisa={d.inPaisa} className="font-medium" />
              <span className="block text-xs text-slate-500">
                {Object.entries(d.byMethod)
                  .map(([m, v]) => `${m} ${Math.round(v / 100).toLocaleString()}`)
                  .join(' · ')}
              </span>
            </div>
          ))}
        </div>
      )}
      {r.receipts.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No receipts in this range.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Receipt</Th>
              <Th>Date</Th>
              <Th>Student</Th>
              <Th>Method</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {r.receipts.map((x) => (
              <tr key={x.id} className={x.reversed ? 'text-slate-400 line-through' : ''}>
                <Td className="font-medium">{x.receiptNumber}</Td>
                <Td>{fmtDate(x.receivedOn)}</Td>
                <Td>
                  {x.student}
                  <span className="block text-xs text-slate-500">{x.section}</span>
                </Td>
                <Td>
                  {x.method}
                  {x.reference ? ` · ${x.reference}` : ''}
                </Td>
                <Td className="text-right">
                  <Money paisa={x.amountPaisa} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function DefaultersTab({ q, csv }: { q: { classId?: string }; csv: string }) {
  const ctx = await requirePortal('STAFF', 'finance.read');
  const [r, sections] = await Promise.all([defaulters(ctx, { ...q, format: 'json' }), listSections(ctx)]);
  const classes = [...new Map(sections.map((s) => [s.className, s.className])).keys()];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-600">
          {r.students} student{r.students === 1 ? '' : 's'} owe{' '}
          <Money paisa={r.totalPaisa} className="font-semibold text-slate-900" /> on bills past due as of{' '}
          {fmtDate(r.asOf)}.
        </p>
        <span className="ml-auto">
          <Csv href={csv} />
        </span>
      </div>
      {r.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nobody is overdue. 🎉</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Class</Th>
              <Th>Student</Th>
              <Th>Guardian</Th>
              <Th>Bills</Th>
              <Th>Oldest due</Th>
              <Th className="text-right">Owed</Th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.studentId}>
                <Td>
                  {x.section}
                  {x.rollNumber ? ` · ${x.rollNumber}` : ''}
                </Td>
                <Td>
                  <Link href={`/staff/finance/collect?student=${x.studentId}`} className="font-medium hover:underline">
                    {x.name}
                  </Link>
                </Td>
                <Td>
                  {x.guardianName ?? '—'}
                  {x.guardianPhone && <span className="block text-xs text-slate-500">{x.guardianPhone}</span>}
                </Td>
                <Td>{x.bills}</Td>
                <Td>{fmtDate(x.oldestDue)}</Td>
                <Td className="text-right font-medium">
                  <Money paisa={x.balancePaisa} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {classes.length > 0 && <p className="mt-2 text-xs text-slate-400">Classes: {classes.join(', ')}</p>}
    </>
  );
}

async function IncomeTab({ csv }: { csv: string }) {
  const ctx = await requirePortal('STAFF', 'finance.read');
  const r = await incomeExpense(ctx, { format: 'json' });
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {r.year.name}: collected <Money paisa={r.totals.feesPaisa} className="font-semibold text-slate-900" />, spent{' '}
          <Money paisa={r.totals.expensesPaisa + r.totals.salariesPaisa} className="font-semibold text-slate-900" />,
          net{' '}
          <Money
            paisa={r.totals.netPaisa}
            className={`font-semibold ${r.totals.netPaisa < 0 ? 'text-rose-700' : 'text-emerald-700'}`}
          />
        </p>
        <Csv href={csv} />
      </div>
      {r.months.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No money movement this year yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th className="text-right">Fees collected</Th>
              <Th className="text-right">Expenses</Th>
              <Th className="text-right">Salaries</Th>
              <Th className="text-right">Net</Th>
            </tr>
          </thead>
          <tbody>
            {r.months.map((m) => (
              <tr key={m.month}>
                <Td className="font-medium">{periodLabel(m.month)}</Td>
                <Td className="text-right">
                  <Money paisa={m.feesPaisa} />
                </Td>
                <Td className="text-right">
                  <Money paisa={m.expensesPaisa} />
                </Td>
                <Td className="text-right">
                  <Money paisa={m.salariesPaisa} />
                </Td>
                <Td className={`text-right font-medium ${m.netPaisa < 0 ? 'text-rose-700' : ''}`}>
                  <Money paisa={m.netPaisa} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
