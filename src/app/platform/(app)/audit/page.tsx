import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Badge, Card, EmptyState, ROLE_LABELS, TabLinks } from '@/components/ui';
import { actionLabel } from '@/lib/audit-labels';
import { requirePortal } from '@/server/auth/page';
import { platformAudit } from '@/server/platform/audit';

export const metadata: Metadata = { title: 'Platform audit log' };
const fmt = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; cursor?: string }>;
}) {
  await requirePortal('PLATFORM', 'platform.audit.read');
  const sp = await searchParams;
  const scope = sp.scope === 'all' ? 'all' : 'platform';
  const cursor = sp.cursor && /^[0-9a-f-]{36}$/i.test(sp.cursor) ? sp.cursor : undefined;
  const { items, nextCursor } = await platformAudit({ scope, cursor });
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Platform actions in full. School activity shows only what kind of action happened, never its contents."
      />
      <Card>
        <div className="mb-3">
          <TabLinks
            active={scope}
            tabs={[
              { key: 'platform', label: 'Platform actions', href: '/platform/audit' },
              { key: 'all', label: 'All activity', href: '/platform/audit?scope=all' },
            ]}
          />
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nothing logged yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {actionLabel(e.action)} {e.outcome !== 'success' && <Badge tone="red">{e.outcome}</Badge>}{' '}
                    {e.support && <Badge tone="amber">Support access</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {e.actor ?? (e.actorRole ? ROLE_LABELS[e.actorRole] : 'System')}
                    {e.school ? ` · ${e.school}` : ' · Platform'}
                  </p>
                </div>
                <time className="text-xs text-slate-400">{fmt(e.at)}</time>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && (
          <div className="mt-4 text-center">
            <Link
              href={`/platform/audit?${scope === 'all' ? 'scope=all&' : ''}cursor=${nextCursor}`}
              className="text-sm font-medium text-link hover:underline"
            >
              Show older →
            </Link>
          </div>
        )}
      </Card>
    </>
  );
}
