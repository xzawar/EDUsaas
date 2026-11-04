import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Card, Stat } from '@/components/ui';
import { TenantsPanel } from '@/components/TenantsPanel';
import { requirePortal } from '@/server/auth/page';
import { listTenants, platformHealth } from '@/server/platform/tenants';

export const metadata: Metadata = { title: 'Schools' };

export default async function PlatformHome() {
  const ctx = await requirePortal('PLATFORM');
  const health = await platformHealth();
  const tenants = ctx.can('platform.tenants.read') ? await listTenants({ limit: 20 }) : null;
  return (
    <>
      <PageHeader
        title="Schools"
        description="Each school is a separate tenant. You see school metadata only, never student or teacher records."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Database" value={health.database === 'ok' ? 'Healthy' : 'Down'} hint={`${health.latencyMs} ms`} />
        <Stat label="Schools" value={health.tenants} />
        <Stat label="User accounts" value={health.users} />
      </div>
      {tenants ? (
        <TenantsPanel initial={tenants} canManage={ctx.can('platform.tenants.manage')} />
      ) : (
        <Card title="Limited access">
          <p className="text-sm text-slate-600">
            Your account can view system health. Ask the Platform Owner for more access.
          </p>
        </Card>
      )}
    </>
  );
}
