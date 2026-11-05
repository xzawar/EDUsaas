import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { PlatformSupportPanel } from '@/components/support/SupportPanels';
import { Badge, Card, KeyValue } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { tenantSupportSummary } from '@/server/platform/support';

export const metadata: Metadata = { title: 'School' };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortal('PLATFORM', 'platform.tenants.manage');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await tenantSupportSummary(id).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={s.tenant.name}
        breadcrumb={
          <Link href="/platform" className="hover:underline">
            ← Schools
          </Link>
        }
        description={`Prefix “${s.tenant.prefix}”${s.tenant.city ? ` · ${s.tenant.city}` : ''}`}
        actions={
          <Badge tone={s.tenant.status === 'ACTIVE' ? 'green' : s.tenant.status === 'SUSPENDED' ? 'red' : 'amber'}>
            {s.tenant.status.toLowerCase()}
          </Badge>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Card
          title="Support access"
          description="You can’t see this school’s data unless its School Admin allows it, for a limited time."
        >
          <PlatformSupportPanel tenantId={s.tenant.id} schoolName={s.tenant.name} grants={s.grants} admins={s.admins} />
        </Card>
        <Card title="School">
          <KeyValue
            items={[
              [
                'Created',
                s.tenant.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
              ],
              ['School Admins', s.admins.length],
            ]}
          />
        </Card>
      </div>
    </>
  );
}
