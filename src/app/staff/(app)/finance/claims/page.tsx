import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { ClaimQueue } from '@/components/finance/ClaimQueue';
import { Card, TabLinks } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listClaims } from '@/server/school/finance/claims';

export const metadata: Metadata = { title: 'Payment proofs' };

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePortal('STAFF', 'fees.collect');
  const { tab } = await searchParams;
  const status = tab === 'confirmed' ? 'CONFIRMED' : tab === 'rejected' ? 'REJECTED' : 'PENDING';
  const list = await listClaims(ctx, { status });
  return (
    <>
      <PageHeader
        title="Payment proofs"
        description="Parents who paid by transfer send a screenshot. Check it against your bank, then confirm or reject."
      />
      <Card>
        <div className="mb-4">
          <TabLinks
            active={status}
            tabs={[
              { key: 'PENDING', label: 'To check', href: '/staff/finance/claims', count: list.pending || undefined },
              { key: 'CONFIRMED', label: 'Confirmed', href: '/staff/finance/claims?tab=confirmed' },
              { key: 'REJECTED', label: 'Rejected', href: '/staff/finance/claims?tab=rejected' },
            ]}
          />
        </div>
        <ClaimQueue items={JSON.parse(JSON.stringify(list.items))} />
      </Card>
    </>
  );
}
