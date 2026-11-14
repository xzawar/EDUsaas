import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { CollectPanel } from '@/components/finance/CollectPanel';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';

export const metadata: Metadata = { title: 'Collect fees' };

export default async function CollectPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const ctx = await requirePortal('STAFF', 'fees.collect');
  const { student } = await searchParams;
  const clock = await inTenant(ctx, (tx) => schoolClock(tx));
  return (
    <>
      <PageHeader title="Collect fees" description="Find the student, take the money, print the receipt." />
      <Card>
        <CollectPanel
          initialStudentId={student && /^[0-9a-f-]{36}$/i.test(student) ? student : undefined}
          today={clock.today}
        />
      </Card>
    </>
  );
}
