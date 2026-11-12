import type { Metadata } from 'next';
import { FinanceOverview } from '@/components/finance/FinanceOverview';
import { requirePortal } from '@/server/auth/page';
import { financeOverview } from '@/server/school/finance/overview';
import { PageHeader } from '@/components/AppShell';

export const metadata: Metadata = { title: 'Finance' };

export default async function FinancePage() {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('finance.read') && !ctx.can('fees.collect')) {
    const { redirect } = await import('next/navigation');
    redirect('/staff');
  }
  const o = await financeOverview(ctx);
  return (
    <>
      <PageHeader title="Finance" description="Money in, money out, and what’s still owed." />
      <FinanceOverview
        o={JSON.parse(JSON.stringify(o))}
        can={{ collect: ctx.can('fees.collect'), reports: ctx.can('finance.read') }}
      />
    </>
  );
}
