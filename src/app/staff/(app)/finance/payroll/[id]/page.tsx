import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { RunActions } from '@/components/finance/PayrollPanel';
import { Money } from '@/components/finance/shared';
import { fmtDate } from '@/lib/finance-format';
import { Badge, Card, ROLE_LABELS, Table, Td, Th } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { inTenant, schoolClock } from '@/server/school/common';
import { payrollRun } from '@/server/school/finance/payroll';

export const metadata: Metadata = { title: 'Payroll' };

export default async function PayrollRunPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('payroll.manage') && !ctx.can('finance.read')) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [run, clock] = await Promise.all([
    payrollRun(ctx, id).catch((e) => {
      if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
      throw e;
    }),
    inTenant(ctx, (tx) => schoolClock(tx)),
  ]);
  const unpaid = run.payslips.filter((p) => !p.paidOn).length;
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/finance/payroll" className="hover:text-slate-800">
            ← Payroll
          </Link>
        }
        title={`Payroll · ${periodLabel(run.period)}`}
        description={
          <span className="flex items-center gap-2">
            <Badge tone={run.status === 'PAID' ? 'green' : run.status === 'FINALISED' ? 'blue' : 'amber'}>
              {run.status === 'DRAFT'
                ? 'Draft — check the amounts'
                : run.status === 'FINALISED'
                  ? `${unpaid} to pay`
                  : 'Paid'}
            </Badge>
            <span>
              {run.payslips.length} payslips · <Money paisa={run.totalPaisa} />
            </span>
          </span>
        }
        actions={
          ctx.can('payroll.manage') ? (
            <RunActions id={run.id} status={run.status} unpaid={unpaid} today={clock.today} />
          ) : undefined
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Payslip</Th>
              <Th>Staff</Th>
              <Th className="text-right">Basic</Th>
              <Th className="text-right">Allowances</Th>
              <Th className="text-right">Deductions</Th>
              <Th className="text-right">Net</Th>
              <Th>Paid</Th>
            </tr>
          </thead>
          <tbody>
            {run.payslips.map((p) => (
              <tr key={p.id}>
                <Td>
                  <a
                    href={`/api/v1/payslips/${p.id}`}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-link hover:underline"
                  >
                    {p.number}
                  </a>
                </Td>
                <Td>
                  {p.name}
                  <span className="block text-xs text-slate-500">{ROLE_LABELS[p.role] ?? p.role}</span>
                </Td>
                <Td className="text-right">
                  <Money paisa={p.basicPaisa} />
                </Td>
                <Td className="text-right">
                  <Money paisa={p.allowancesPaisa} />
                </Td>
                <Td className="text-right">
                  <Money paisa={p.deductionsPaisa + p.leaveDeductionPaisa} />
                  {p.unpaidLeaveDays > 0 && (
                    <span className="block text-xs text-rose-600">
                      {p.unpaidLeaveDays} unpaid leave day{p.unpaidLeaveDays === 1 ? '' : 's'}
                    </span>
                  )}
                </Td>
                <Td className="text-right font-semibold">
                  <Money paisa={p.netPaisa} />
                </Td>
                <Td>
                  {p.paidOn ? (
                    `${fmtDate(p.paidOn)}${p.method ? ` · ${p.method}` : ''}`
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
