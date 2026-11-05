import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { PlatformSupportPanel } from '@/components/support/SupportPanels';
import { Badge, Card, KeyValue } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { canUseSupportAccess, tenantSupportSummary } from '@/server/platform/support';
import { listPlans, tenantSubscription } from '@/server/platform/plans';
import { SubscriptionForm } from '@/components/platform/PlatformForms';
import { Meter } from '@/components/charts';

export const metadata: Metadata = { title: 'School' };

export default async function TenantPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ticket?: string }>;
}) {
  const ctx = await requirePortal('PLATFORM');
  if (!ctx.can('platform.tenants.read') && !canUseSupportAccess(ctx)) redirect('/platform');
  const { id } = await params;
  const { ticket } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [plans, sub] = ctx.can('platform.plans.manage')
    ? await Promise.all([listPlans(), tenantSubscription(id)])
    : [null, null];
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
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card
          title="Support access"
          description="You can’t see this school’s data unless its School Admin allows it, for a limited time."
        >
          {canUseSupportAccess(ctx) ? (
            <PlatformSupportPanel
              tenantId={s.tenant.id}
              schoolName={s.tenant.name}
              grants={s.grants}
              admins={ctx.can('platform.tenants.manage') ? s.admins : []}
              ticketId={ticket && /^[0-9a-f-]{36}$/i.test(ticket) ? ticket : undefined}
              byAdmin={ctx.user.role === 'PLATFORM_ADMIN'}
            />
          ) : (
            <p className="text-sm text-slate-500">Ask the Platform Owner if you need support access.</p>
          )}
        </Card>
        <div className="space-y-6">
          {plans && sub && (
            <Card
              title="Subscription"
              description={
                sub.subscription
                  ? `${sub.subscription.plan.name} · ${sub.subscription.status.toLowerCase().replace('_', ' ')}`
                  : 'No plan yet'
              }
            >
              <div className="mb-4 space-y-3">
                <Meter
                  value={sub.usage.students}
                  max={sub.subscription?.plan.maxStudents ?? Math.max(sub.usage.students, 1)}
                  label={`Students ${sub.usage.students}${sub.subscription?.plan.maxStudents ? ` of ${sub.subscription.plan.maxStudents}` : ''}`}
                />
                <Meter
                  value={sub.usage.staff}
                  max={sub.subscription?.plan.maxStaff ?? Math.max(sub.usage.staff, 1)}
                  label={`Staff ${sub.usage.staff}${sub.subscription?.plan.maxStaff ? ` of ${sub.subscription.plan.maxStaff}` : ''}`}
                />
                <p className="text-xs text-slate-500">
                  Students {sub.usage.students}
                  {sub.subscription?.plan.maxStudents ? ` / ${sub.subscription.plan.maxStudents}` : ''} · Staff{' '}
                  {sub.usage.staff}
                  {sub.subscription?.plan.maxStaff ? ` / ${sub.subscription.plan.maxStaff}` : ''}
                </p>
              </div>
              <SubscriptionForm
                tenantId={s.tenant.id}
                plans={plans.map((p) => ({ id: p.id, name: p.name, active: p.active }))}
                current={
                  sub.subscription
                    ? {
                        planId: sub.subscription.planId,
                        status: sub.subscription.status,
                        renewsOn: sub.subscription.renewsOn?.toISOString().slice(0, 10) ?? null,
                        notes: sub.subscription.notes,
                      }
                    : null
                }
              />
            </Card>
          )}
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
      </div>
    </>
  );
}
