import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { ClaimButton } from '@/components/finance/ClaimForm';
import { InvoiceStatus, Money } from '@/components/finance/shared';
import { fmtDate, METHOD_LABELS } from '@/lib/finance-format';
import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { myFees } from '@/server/school/finance/invoices';
import { Receipt } from 'lucide-react';

export const metadata: Metadata = { title: 'Fees' };

export default async function StudentFeesPage() {
  const ctx = await requirePortal('STUDENT', 'self.fees');
  const [fees, clock] = await Promise.all([myFees(ctx), inTenant(ctx, (tx) => schoolClock(tx))]);
  const open = fees.invoices.filter((i) => i.status === 'DUE' || i.status === 'PARTIAL');
  return (
    <>
      <PageHeader
        title="Fees"
        description="Your bills and receipts. Pay at the school office, or send proof of a transfer here."
        actions={
          <ClaimButton
            bills={open.map((i) => ({ id: i.id, number: i.number, period: i.period, balancePaisa: i.balancePaisa }))}
            today={clock.today}
          />
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className={`rounded-2xl p-5 ${fees.outstandingPaisa > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <p className="text-xs text-slate-600">To pay</p>
          <p className="text-3xl font-semibold tabular-nums">
            <Money paisa={fees.outstandingPaisa} />
          </p>
          {open.length > 0 && (
            <p className="text-sm text-slate-600">
              {open.length} bill{open.length === 1 ? '' : 's'} open
            </p>
          )}
          {fees.outstandingPaisa === 0 && <p className="text-sm text-slate-600">All paid. Thank you!</p>}
        </div>
        {fees.advancePaisa > 0 && (
          <div className="rounded-2xl bg-sky-50 p-5">
            <p className="text-xs text-slate-600">Paid in advance</p>
            <p className="text-3xl font-semibold tabular-nums">
              <Money paisa={fees.advancePaisa} />
            </p>
            <p className="text-sm text-slate-600">Goes towards the next bill.</p>
          </div>
        )}
      </div>
      {fees.claims.some((c) => c.status === 'PENDING') && (
        <Card className="mb-6" title="Waiting for the school office">
          <ul className="space-y-1 text-sm">
            {fees.claims
              .filter((c) => c.status === 'PENDING')
              .map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>
                    <Money paisa={c.amountPaisa} /> by {METHOD_LABELS[c.method] ?? c.method} · ref {c.reference}
                  </span>
                  <Badge tone="amber">Checking</Badge>
                </li>
              ))}
          </ul>
        </Card>
      )}
      <Card title="Bills">
        {fees.invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-5" />}
            title="No bills yet"
            description="Your monthly fee bill appears here when the school issues it."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th>Due</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Left</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {fees.invoices.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <span className="font-medium">{periodLabel(i.period)}</span>
                    <span className="block text-xs text-slate-500">{i.number}</span>
                  </Td>
                  <Td>{fmtDate(i.dueOn)}</Td>
                  <Td className="text-right">
                    <Money paisa={i.totalPaisa} />
                    {i.lateFeePaisa > 0 && <span className="block text-xs text-rose-600">incl. late fee</span>}
                  </Td>
                  <Td className="text-right font-medium">
                    <Money paisa={i.balancePaisa} />
                  </Td>
                  <Td>
                    <InvoiceStatus status={i.status} overdue={i.overdue} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {fees.payments.length > 0 && (
        <Card title="Receipts" className="mt-6">
          <ul className="divide-y divide-slate-100">
            {fees.payments
              .filter((p) => !p.isReversal)
              .map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between py-2 text-sm ${p.reversed ? 'text-slate-400 line-through' : ''}`}
                >
                  <span>
                    <span className="font-medium">{p.receiptNumber}</span> · {fmtDate(p.receivedOn)} ·{' '}
                    {METHOD_LABELS[p.method] ?? p.method}
                  </span>
                  <span className="flex items-center gap-3">
                    <Money paisa={p.amountPaisa} />
                    <a
                      href={`/api/v1/payments/${p.id}/receipt`}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--accent)] hover:underline"
                    >
                      PDF
                    </a>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
      {fees.claims.some((c) => c.status === 'REJECTED') && (
        <Card title="Not accepted" className="mt-6">
          <ul className="space-y-1 text-sm">
            {fees.claims
              .filter((c) => c.status === 'REJECTED')
              .map((c) => (
                <li key={c.id}>
                  <Money paisa={c.amountPaisa} /> ref {c.reference}:{' '}
                  <span className="text-slate-600">{c.decisionNote}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </>
  );
}
