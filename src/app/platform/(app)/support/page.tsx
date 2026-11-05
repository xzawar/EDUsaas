import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { OwnerDecision } from '@/components/platform/PlatformForms';
import { Badge, Card, EmptyState, TabLinks } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { awaitingOwner } from '@/server/platform/support';
import { ticketQueue } from '@/server/platform/tickets';

export const metadata: Metadata = { title: 'Support' };
const TONE = { OPEN: 'amber', ANSWERED: 'blue', CLOSED: 'slate' } as const;
const fmt = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const ctx = await requirePortal('PLATFORM');
  const sp = await searchParams;
  const status = (['OPEN', 'ANSWERED', 'CLOSED', 'ALL'] as const).find((s) => s === sp.status) ?? 'OPEN';
  const [queue, waiting] = await Promise.all([
    ctx.can('platform.support.queue') ? ticketQueue({ status }) : Promise.resolve(null),
    ctx.can('platform.tenants.manage') ? awaitingOwner() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Support" description="Questions from schools, and support-access requests that need you." />
      <div className="space-y-6">
        {waiting.length > 0 && (
          <Card
            title="Support access waiting for you"
            description="A Platform Admin asked to look into a school. If you approve, the school still decides."
          >
            <ul className="divide-y divide-slate-100">
              {waiting.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {w.requester} → {w.school.name} · {w.minutes >= 60 ? `${w.minutes / 60} h` : `${w.minutes} min`}
                    </p>
                    <p className="text-sm text-slate-600">{w.reason}</p>
                  </div>
                  <OwnerDecision id={w.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
        {queue ? (
          <Card>
            <div className="mb-3">
              <TabLinks
                active={status}
                tabs={[
                  { key: 'OPEN', label: 'Open', href: '/platform/support', count: queue.counts.OPEN ?? 0 },
                  {
                    key: 'ANSWERED',
                    label: 'Answered',
                    href: '/platform/support?status=ANSWERED',
                    count: queue.counts.ANSWERED ?? 0,
                  },
                  { key: 'CLOSED', label: 'Closed', href: '/platform/support?status=CLOSED' },
                  { key: 'ALL', label: 'All', href: '/platform/support?status=ALL' },
                ]}
              />
            </div>
            {queue.items.length === 0 ? (
              <EmptyState title="Nothing here" description="No tickets in this list." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {queue.items.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/platform/support/${t.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">{t.subject}</span>
                        <span className="block text-xs text-slate-500">
                          {t.school.name} · {t.author} · {t.messages} message{t.messages === 1 ? '' : 's'} ·{' '}
                          {fmt(t.updatedAt)}
                        </span>
                      </span>
                      <Badge tone={TONE[t.status]}>{t.status.toLowerCase()}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : (
          waiting.length === 0 && (
            <Card>
              <EmptyState title="No access to the ticket queue" description="Ask the Platform Owner to grant it." />
            </Card>
          )
        )}
      </div>
    </>
  );
}
