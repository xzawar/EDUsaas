import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { GenerateButton } from '@/components/finance/InvoiceActions';
import { InvoiceStatus, Money } from '@/components/finance/shared';
import { fmtDate } from '@/lib/finance-format';
import { Badge, Card, EmptyState, Select, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { listInvoices, listInvoicesQuery } from '@/server/school/finance/invoices';
import { feeStructure, listFeeHeads } from '@/server/school/finance/setup';
import { currentYear, listSections } from '@/server/school/structure';
import { periodLabel } from '@/lib/periods';
import { ButtonLink } from '@/components/ui';
import { Receipt } from 'lucide-react';

export const metadata: Metadata = { title: 'Fee bills' };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('fees.collect') && !ctx.can('finance.read')) {
    const { redirect } = await import('next/navigation');
    redirect('/staff');
  }
  const sp = await searchParams;
  const parsed = listInvoicesQuery.safeParse(sp);
  const q = parsed.success ? parsed.data : listInvoicesQuery.parse({});
  const [clock, list, sections, heads, year] = await Promise.all([
    inTenant(ctx, (tx) => schoolClock(tx)),
    listInvoices(ctx, q),
    listSections(ctx),
    listFeeHeads(ctx),
    currentYear(ctx),
  ]);
  const classes = year ? (await feeStructure(ctx, year.id)).classes : [];
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(`${clock.today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/staff/finance/invoices?${p.toString()}`;
  };
  const sumBalance = list.items.reduce((a, i) => a + i.balancePaisa, 0);

  return (
    <>
      <PageHeader
        title="Fee bills"
        description="One bill per student per month. Generate the month, then collect at the counter."
        actions={
          ctx.can('fees.collect') ? (
            <GenerateButton month={clock.today.slice(0, 7)} classes={classes} hasFees={heads.length > 0} />
          ) : undefined
        }
      />
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3" action="/staff/finance/invoices">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Month</span>
            <Select name="period" defaultValue={q.period ?? ''} className="h-9">
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {periodLabel(m)}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Section</span>
            <Select name="sectionId" defaultValue={q.sectionId ?? ''} className="h-9">
              <option value="">All</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Status</span>
            <Select name="status" defaultValue={q.status ?? ''} className="h-9">
              <option value="">Any</option>
              <option value="OPEN">Unpaid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="PARTIAL">Part paid</option>
              <option value="PAID">Paid</option>
              <option value="VOID">Cancelled</option>
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Search</span>
            <input
              name="q"
              defaultValue={q.q ?? ''}
              placeholder="Name, username or bill no."
              className="h-9 rounded-lg border border-slate-300 px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-white hover:brightness-110"
          >
            Show
          </button>
        </form>
        {list.items.length === 0 ? (
          heads.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="Set up fees first"
              description="Add fee heads and the amount each class pays. Then generate the month’s bills."
              action={
                ctx.can('fees.manage') ? <ButtonLink href="/staff/finance/setup">Fee setup</ButtonLink> : undefined
              }
            />
          ) : (
            <EmptyState
              icon={<Receipt className="size-5" />}
              title="No bills match"
              description={
                q.period || q.status || q.q
                  ? 'Try a wider filter.'
                  : `Generate ${periodLabel(clock.today.slice(0, 7))} to bill every student.`
              }
            />
          )
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-600">
              {list.total.toLocaleString()} bill{list.total === 1 ? '' : 's'}
              {sumBalance > 0 && (
                <>
                  {' '}
                  · balance on this page <Money paisa={sumBalance} className="font-medium" />
                </>
              )}
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Bill</Th>
                  <Th>Student</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <Link href={`/staff/finance/invoices/${i.id}`} className="font-medium hover:underline">
                        {i.number}
                      </Link>
                      <span className="block text-xs text-slate-500">{periodLabel(i.period)}</span>
                    </Td>
                    <Td>
                      <Link href={`/staff/finance/collect?student=${i.student.id}`} className="hover:underline">
                        {i.student.name}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {i.student.section}
                        {i.student.rollNumber ? ` · ${i.student.rollNumber}` : ''}
                      </span>
                    </Td>
                    <Td className="text-slate-600">{fmtDate(i.dueOn)}</Td>
                    <Td className="text-right">
                      <Money paisa={i.totalPaisa} />
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
            {list.pages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
                <span>
                  Page {list.page} of {list.pages}
                </span>
                <span className="flex gap-2">
                  {list.page > 1 && (
                    <Link className="hover:underline" href={href({ page: String(list.page - 1) })}>
                      ← Previous
                    </Link>
                  )}
                  {list.page < list.pages && (
                    <Link className="hover:underline" href={href({ page: String(list.page + 1) })}>
                      Next →
                    </Link>
                  )}
                </span>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-500">
        <Badge tone="red">Overdue</Badge> bills may carry a late fee from the rule in Fee setup.
      </p>
    </>
  );
}
