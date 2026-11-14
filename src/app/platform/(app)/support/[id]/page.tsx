import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { ReplyForm } from '@/components/platform/PlatformForms';
import { Badge, Card, cx } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { ticketDetail } from '@/server/platform/tickets';

export const metadata: Metadata = { title: 'Ticket' };
const fmt = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('PLATFORM', 'platform.support.queue');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await ticketDetail(id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        title={t.subject}
        breadcrumb={
          <Link href="/platform/support" className="hover:underline">
            ← Support
          </Link>
        }
        description={`${t.school.name} · opened by ${t.author} · ${fmt(t.createdAt)}`}
        actions={
          <Badge tone={t.status === 'OPEN' ? 'amber' : t.status === 'ANSWERED' ? 'blue' : 'slate'}>
            {t.status.toLowerCase()}
          </Badge>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <ol className="space-y-3">
            {t.messages.map((m) => (
              <li
                key={m.id}
                className={cx('rounded-2xl px-4 py-3', m.fromPlatform ? 'ml-8 bg-tint' : 'mr-8 bg-slate-50')}
              >
                <p className="text-xs text-slate-500">
                  {m.author} · {fmt(m.createdAt)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          {t.status !== 'CLOSED' && (
            <div className="mt-4">
              <ReplyForm endpoint={`/platform/tickets/${t.id}/reply`} platform />
            </div>
          )}
        </Card>
        {(ctx.can('platform.tenants.manage') || ctx.can('platform.support.access')) && (
          <Card title="Need to look inside?">
            <p className="text-sm text-slate-600">
              Ask {t.school.name} for time-boxed, read-only access. The school decides, and sees everything you open.
            </p>
            <Link
              href={`/platform/tenants/${t.school.id}?ticket=${t.id}`}
              className="mt-3 inline-block text-sm font-medium text-link hover:underline"
            >
              Ask for support access →
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
