import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { InvoiceAdminActions } from '@/components/finance/InvoiceActions';
import { InvoiceStatus, Money } from '@/components/finance/shared';
import { fmtDate } from '@/lib/finance-format';
import { Card, KeyValue, Table, Td, Th, ButtonLink } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { invoiceDetail } from '@/server/school/finance/invoices';

export const metadata: Metadata = { title: 'Fee bill' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('fees.collect') && !ctx.can('finance.read')) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const inv = await invoiceDetail(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const open = inv.status === 'DUE' || inv.status === 'PARTIAL';
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/finance/invoices" className="hover:text-slate-800">
            ← Fee bills
          </Link>
        }
        title={`${inv.number} · ${periodLabel(inv.period)}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/staff/finance/collect?student=${inv.student.id}`} className="hover:underline">
              {inv.student.name}
            </Link>
            <span className="text-slate-400">·</span>
            <span>{inv.student.section}</span>
            <InvoiceStatus status={inv.status} overdue={inv.overdue} />
          </span>
        }
        actions={
          <>
            {open && ctx.can('fees.collect') && (
              <ButtonLink href={`/staff/finance/collect?student=${inv.student.id}`}>Take payment</ButtonLink>
            )}
            {ctx.can('fees.collect') && (
              <InvoiceAdminActions
                id={inv.id}
                status={inv.status}
                hasPayments={inv.payments.length > 0}
                lateFeePaisa={inv.lateFeePaisa}
                waived={inv.lateFeeWaived}
              />
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Lines" className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Amount</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.description}</Td>
                  <Td className="text-right">
                    <Money paisa={l.amountPaisa} />
                  </Td>
                  <Td className="text-right text-slate-500">
                    {l.discountPaisa ? <Money paisa={-l.discountPaisa} /> : '—'}
                  </Td>
                  <Td className="text-right font-medium">
                    <Money paisa={l.amountPaisa - l.discountPaisa} />
                  </Td>
                </tr>
              ))}
              {inv.lateFeePaisa > 0 && (
                <tr>
                  <Td className="text-rose-700">Late fee</Td>
                  <Td />
                  <Td />
                  <Td className="text-right font-medium text-rose-700">
                    <Money paisa={inv.lateFeePaisa} />
                  </Td>
                </tr>
              )}
              <tr className="font-semibold">
                <Td>Total</Td>
                <Td />
                <Td />
                <Td className="text-right">
                  <Money paisa={inv.totalPaisa} />
                </Td>
              </tr>
            </tbody>
          </Table>
          {inv.voidReason && <p className="mt-3 text-sm text-slate-500">Cancelled: {inv.voidReason}</p>}
        </Card>
        <Card title="Summary">
          <KeyValue
            items={[
              ['Issued', fmtDate(inv.issuedOn)],
              ['Due', fmtDate(inv.dueOn)],
              ['Paid', <Money key="p" paisa={inv.paidPaisa} />],
              ['Balance', <Money key="b" paisa={inv.balancePaisa} className="font-semibold" />],
              ['Guardian', inv.student.guardianName ?? '—'],
              ['Phone', inv.student.guardianPhone ?? '—'],
            ]}
          />
        </Card>
        <Card title="Payments on this bill" className="lg:col-span-3">
          {inv.payments.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing paid yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Receipt</Th>
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Applied</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.paymentId} className={p.reversed ? 'text-slate-400 line-through' : ''}>
                    <Td className="font-medium">{p.receiptNumber}</Td>
                    <Td>{fmtDate(p.receivedOn)}</Td>
                    <Td>
                      {p.method}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </Td>
                    <Td className="text-right">
                      <Money paisa={p.amountPaisa} />
                    </Td>
                    <Td className="text-right">
                      <a
                        href={`/api/v1/payments/${p.paymentId}/receipt`}
                        target="_blank"
                        rel="noopener"
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        PDF
                      </a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
