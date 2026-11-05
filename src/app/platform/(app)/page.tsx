import { Activity, Banknote, LifeBuoy, School } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Panel, PastelStat, TodoItem } from '@/components/dashboard/widgets';
import { TenantsPanel } from '@/components/TenantsPanel';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { platformOverview } from '@/server/platform/overview';
import { listTenants, platformHealth } from '@/server/platform/tenants';
import { ticketQueue } from '@/server/platform/tickets';

export const metadata: Metadata = { title: 'Overview' };

const pkr = (n: number) => `PKR ${n.toLocaleString('en-US')}`;

export default async function PlatformHome() {
  const ctx = await requirePortal('PLATFORM');
  const owner = ctx.can('platform.plans.manage');
  const [health, tenants, overview, tickets] = await Promise.all([
    platformHealth(),
    ctx.can('platform.tenants.read') ? listTenants({ limit: 20 }) : Promise.resolve(null),
    owner ? platformOverview() : Promise.resolve(null),
    !owner && ctx.can('platform.support.queue') ? ticketQueue({ status: 'OPEN' }) : Promise.resolve(null),
  ]);
  const dbOk = health.database === 'ok';

  if (overview) {
    const o = overview;
    const todo = o.awaitingOwner + o.openTickets + o.pastDue.length + o.nearLimit.length + o.withoutPlan.length;
    return (
      <>
        <PageHeader
          title="Overview"
          description="How EDUsaas is doing: schools, revenue and support. School records stay private."
        />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PastelStat
            tone="violet"
            icon={<School className="size-6" />}
            title="Schools"
            value={`${o.schools.active} active · ${o.schools.trial} trial`}
            caption={o.schools.suspended ? `${o.schools.suspended} suspended` : `${o.schools.total} in total`}
          />
          <PastelStat
            tone="mint"
            icon={<Banknote className="size-6" />}
            title="Monthly revenue"
            value={pkr(o.monthlyRevenue)}
            caption={`${o.subscriptions.active} paying school${o.subscriptions.active === 1 ? '' : 's'}`}
            href="/platform/plans"
          />
          <PastelStat
            tone="pink"
            icon={<LifeBuoy className="size-6" />}
            title="Support"
            value={`${o.openTickets} open question${o.openTickets === 1 ? '' : 's'}`}
            caption={
              o.awaitingOwner
                ? `${o.awaitingOwner} access request${o.awaitingOwner === 1 ? '' : 's'} need you`
                : 'Nothing waiting on you'
            }
            href="/platform/support"
          />
          <PastelStat
            tone="sky"
            icon={<Activity className="size-6" />}
            title={dbOk ? 'All systems normal' : 'Database down'}
            value={`${health.users.toLocaleString()} accounts`}
            caption={`Database ${dbOk ? 'healthy' : 'unreachable'} · ${health.latencyMs} ms`}
          />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Needs you">
            {todo === 0 ? (
              <p className="px-1 py-3 text-sm text-slate-500">All clear. Nothing waiting on you.</p>
            ) : (
              <div className="-mx-2 space-y-0.5">
                {o.awaitingOwner > 0 && (
                  <TodoItem href="/platform/support" count={o.awaitingOwner} tone="violet">
                    support-access request{o.awaitingOwner === 1 ? '' : 's'} to approve
                  </TodoItem>
                )}
                {o.openTickets > 0 && (
                  <TodoItem href="/platform/support" count={o.openTickets} tone="pink">
                    school question{o.openTickets === 1 ? '' : 's'} not answered
                  </TodoItem>
                )}
                {o.pastDue.length > 0 && (
                  <TodoItem href={`/platform/tenants/${o.pastDue[0]!.id}`} count={o.pastDue.length} tone="amber">
                    payment{o.pastDue.length === 1 ? '' : 's'} overdue
                  </TodoItem>
                )}
                {o.withoutPlan.length > 0 && (
                  <TodoItem href={`/platform/tenants/${o.withoutPlan[0]!.id}`} count={o.withoutPlan.length} tone="sky">
                    school{o.withoutPlan.length === 1 ? '' : 's'} without a plan (next: {o.withoutPlan[0]!.name})
                  </TodoItem>
                )}
              </div>
            )}
          </Panel>
          <Panel title="Close to plan limits" action={<span className="text-sm text-slate-500">85%+ used</span>}>
            {o.nearLimit.length ? (
              <ul className="space-y-1">
                {o.nearLimit.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/platform/tenants/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block text-xs text-slate-500">
                          {s.plan} · {s.students}
                          {s.maxStudents ? ` of ${s.maxStudents}` : ''} students · {s.staff}
                          {s.maxStaff ? ` of ${s.maxStaff}` : ''} staff
                        </span>
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums">
                        {Math.round(s.ratio * 100)}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-3 text-sm text-slate-500">
                No school is near its limit. Schools that pass 85% of their students or staff show here, so you can
                offer a bigger plan.
              </p>
            )}
          </Panel>
        </div>
        {tenants && <TenantsPanel initial={tenants} canManage={ctx.can('platform.tenants.manage')} />}
      </>
    );
  }

  // Platform Admin: an operations view shaped by what the Owner switched on.
  const open = tickets?.items.length ?? 0;
  return (
    <>
      <PageHeader title="Overview" description="System health, and the work the Platform Owner gave you." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <PastelStat
          tone="sky"
          icon={<Activity className="size-6" />}
          title={dbOk ? 'All systems normal' : 'Database down'}
          value={`${health.latencyMs} ms`}
          caption={`Database ${dbOk ? 'healthy' : 'unreachable'}`}
        />
        <PastelStat
          tone="violet"
          icon={<School className="size-6" />}
          title="Schools"
          value={health.tenants}
          caption={`${health.users.toLocaleString()} accounts`}
        />
        {tickets && (
          <PastelStat
            tone="pink"
            icon={<LifeBuoy className="size-6" />}
            title="Open questions"
            value={open ? `${open} to answer` : 'All answered'}
            href="/platform/support"
          />
        )}
      </div>
      {tickets && open > 0 && (
        <Panel title="Questions waiting" className="mb-6">
          <ul className="space-y-1">
            {tickets.items.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/platform/support/${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{t.subject}</span>
                    <span className="block text-xs text-slate-500">{t.school.name}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {tenants ? (
        <TenantsPanel initial={tenants} canManage={ctx.can('platform.tenants.manage')} />
      ) : (
        <Card title="Limited access">
          <p className="text-sm text-slate-600">
            Your account can view system health. Ask the Platform Owner if you need to see schools or answer support
            questions.
          </p>
        </Card>
      )}
    </>
  );
}
