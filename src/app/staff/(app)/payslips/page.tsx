import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Money } from '@/components/finance/shared';
import { fmtDate } from '@/lib/finance-format';
import { Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { periodLabel } from '@/lib/periods';
import { requirePortal } from '@/server/auth/page';
import { myPayslips } from '@/server/school/finance/payroll';
import { FileSpreadsheet } from 'lucide-react';

export const metadata: Metadata = { title: 'My payslips' };

export default async function MyPayslipsPage() {
  const ctx = await requirePortal('STAFF');
  const slips = await myPayslips(ctx);
  return (
    <>
      <PageHeader title="My payslips" description="One per month once the office finalises payroll." />
      <Card>
        {slips.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="size-5" />}
            title="No payslips yet"
            description="They appear here after the office runs payroll for the month."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th className="text-right">Net pay</Th>
                <Th>Paid</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {slips.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{periodLabel(p.period)}</Td>
                  <Td className="text-right">
                    <Money paisa={p.netPaisa} />
                  </Td>
                  <Td>{p.paidOn ? fmtDate(p.paidOn) : <span className="text-slate-400">Not yet</span>}</Td>
                  <Td className="text-right">
                    <a
                      href={`/api/v1/payslips/${p.id}`}
                      target="_blank"
                      rel="noopener"
                      className="text-sm text-link hover:underline"
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
    </>
  );
}
