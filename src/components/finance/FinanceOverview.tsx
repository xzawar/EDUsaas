import { AlertTriangle, Banknote, FileCheck, HandCoins, Receipt, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Panel, PanelLink, PastelStat, TodoItem } from '@/components/dashboard/widgets';
import { Money } from '@/components/finance/shared';
import { periodLabel } from '@/lib/periods';
import type { financeOverview } from '@/server/school/finance/overview';

type O = Awaited<ReturnType<typeof financeOverview>>;

/** Shared by the Accountant dashboard and the Finance page. */
export function FinanceOverview({ o, can }: { o: O; can: { collect: boolean; reports: boolean } }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <PastelStat
          tone="mint"
          icon={<HandCoins className="size-6" />}
          title="Collected today"
          value={<Money paisa={o.collectedTodayPaisa} />}
          caption={
            o.reversedTodayPaisa > 0 ? (
              <>
                {o.today} · <Money paisa={o.reversedTodayPaisa} /> reversed
              </>
            ) : (
              o.today
            )
          }
          href={can.collect ? '/staff/finance/collect' : undefined}
        />
        <PastelStat
          tone="violet"
          icon={<Receipt className="size-6" />}
          title={`${periodLabel(o.month)} so far`}
          value={<Money paisa={o.monthCollectedPaisa} />}
          caption={
            o.monthBills
              ? `of ${Math.round(o.monthInvoicedPaisa / 100).toLocaleString()} billed to ${o.monthBills} students`
              : 'No bills generated this month'
          }
          href="/staff/finance/invoices"
        />
        <PastelStat
          tone="amber"
          icon={<AlertTriangle className="size-6" />}
          title="Outstanding"
          value={<Money paisa={o.outstandingPaisa} />}
          caption={`${o.defaulters} student${o.defaulters === 1 ? '' : 's'} overdue`}
          href={can.reports ? '/staff/finance/reports?tab=defaulters' : '/staff/finance/invoices?status=OVERDUE'}
        />
        <PastelStat
          tone="pink"
          icon={<Banknote className="size-6" />}
          title="Spent this month"
          value={<Money paisa={o.monthExpensesPaisa} />}
          caption="Expenses and salaries"
          href="/staff/finance/expenses"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Needs you">
          {o.claimsPending === 0 && o.monthBills > 0 ? (
            <p className="py-2 text-sm text-slate-500">All clear. Nothing waiting on you.</p>
          ) : (
            <div className="-mx-2 space-y-0.5">
              {o.claimsPending > 0 && (
                <TodoItem href="/staff/finance/claims" count={o.claimsPending} tone="pink">
                  payment proof{o.claimsPending === 1 ? '' : 's'} to check
                </TodoItem>
              )}
              {o.monthBills === 0 && can.collect && (
                <TodoItem href="/staff/finance/invoices" count={1} tone="violet">
                  generate {periodLabel(o.month)} bills
                </TodoItem>
              )}
            </div>
          )}
        </Panel>
        <Panel
          title="Recent payments"
          action={can.collect ? <PanelLink href="/staff/finance/collect">Collect</PanelLink> : undefined}
        >
          {o.recentPayments.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">No payments yet.</p>
          ) : (
            <ul className="space-y-1">
              {o.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.student}</span>
                    <span className="block text-xs text-slate-500">
                      {p.receiptNumber} · {p.method}
                    </span>
                  </span>
                  <Money paisa={p.amountPaisa} className="text-sm font-medium" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          can.collect && ['/staff/finance/collect', 'Collect fees', HandCoins],
          can.collect && ['/staff/finance/invoices', 'Fee bills', Receipt],
          can.collect && ['/staff/finance/claims', 'Payment proofs', FileCheck],
          ['/staff/finance/expenses', 'Expenses', Banknote],
          ['/staff/finance/payroll', 'Payroll', Wallet],
          can.reports && ['/staff/finance/reports', 'Reports', Receipt],
        ]
          .filter(Boolean)
          .map((x) => {
            const [href, label, Icon] = x as [string, string, typeof Receipt];
            return (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <Icon className="size-4 text-slate-500" /> {label}
              </Link>
            );
          })}
      </div>
    </div>
  );
}
