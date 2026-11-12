import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { NewRunButton, SalaryRoster } from '@/components/finance/PayrollPanel';
import { Money } from '@/components/finance/shared';
import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { listPayrollRuns, salaryRoster } from '@/server/school/finance/payroll';
import { Banknote } from 'lucide-react';

export const metadata: Metadata = { title: 'Payroll' };
const TONE = { DRAFT: 'amber', FINALISED: 'blue', PAID: 'green' } as const;

export default async function PayrollPage() {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('payroll.manage') && !ctx.can('finance.read')) {
    const { redirect } = await import('next/navigation');
    redirect('/staff');
  }
  const canManage = ctx.can('payroll.manage');
  const [clock, runs, roster] = await Promise.all([
    inTenant(ctx, (tx) => schoolClock(tx)),
    listPayrollRuns(ctx),
    canManage ? salaryRoster(ctx) : Promise.resolve([]),
  ]);
  const withSalary = roster.filter((r) => r.netPaisa !== null).length;
  return (
    <>
      <PageHeader
        title="Payroll"
        description="Set each person’s salary once. Each month: run, check, finalise, pay."
        actions={canManage && withSalary > 0 ? <NewRunButton month={clock.today.slice(0, 7)} /> : undefined}
      />
      <div className="space-y-6">
        <Card title="Monthly runs">
          {runs.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-5" />}
              title="No payroll yet"
              description={
                withSalary
                  ? 'Create this month’s payroll to make draft payslips.'
                  : 'Set salaries below first, then run the month.'
              }
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th>Staff</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/staff/finance/payroll/${r.id}`} className="font-medium hover:underline">
                        {periodLabel(r.period)}
                      </Link>
                    </Td>
                    <Td>{r.staff}</Td>
                    <Td className="text-right">
                      <Money paisa={r.totalPaisa} />
                    </Td>
                    <Td>
                      <Badge tone={TONE[r.status as keyof typeof TONE]}>
                        {r.status === 'FINALISED' ? 'To pay' : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        {canManage && (
          <Card
            title="Salaries"
            description={`${withSalary} of ${roster.length} staff have a salary set. Only they get a payslip.`}
          >
            <SalaryRoster roster={JSON.parse(JSON.stringify(roster))} today={clock.today} />
          </Card>
        )}
      </div>
    </>
  );
}
