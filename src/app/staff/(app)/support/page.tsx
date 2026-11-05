import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { CloseTicketButton, NewTicketButton } from '@/components/comms/Tickets';
import { ReplyForm } from '@/components/platform/PlatformForms';
import { Badge, Card, EmptyState, cx } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { canUseSupport, myTickets } from '@/server/school/tickets';

export const metadata: Metadata = { title: 'Help & support' };
const fmt = (d: Date) =>
  d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });
const LABEL = {
  OPEN: ['Waiting for EDUsaas', 'amber'],
  ANSWERED: ['EDUsaas replied', 'blue'],
  CLOSED: ['Closed', 'slate'],
} as const;

export default async function SupportPage() {
  const ctx = await requirePortal('STAFF');
  if (!canUseSupport(ctx)) redirect('/staff');
  const tickets = await myTickets(ctx);
  return (
    <>
      <PageHeader
        title="Help & support"
        description={
          <>
            Questions for the EDUsaas team. If they need to look inside your school, they ask first in{' '}
            <Link href="/staff/settings#support" className="font-medium text-[var(--accent)] hover:underline">
              Settings
            </Link>
            .
          </>
        }
        actions={<NewTicketButton />}
      />
      {tickets.length === 0 ? (
        <Card>
          <EmptyState title="No questions yet" description="Ask anything — setup help, a bug, or a bigger plan." />
        </Card>
      ) : (
        <div className="space-y-4">
          {tickets.map((t) => (
            <Card
              key={t.id}
              title={t.subject}
              description={`Opened by ${t.author} · ${fmt(t.createdAt)}`}
              actions={
                <div className="flex items-center gap-2">
                  <Badge tone={LABEL[t.status][1]}>{LABEL[t.status][0]}</Badge>
                  {t.status !== 'CLOSED' && <CloseTicketButton id={t.id} />}
                </div>
              }
            >
              <ol className="space-y-2">
                {t.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cx(
                      'rounded-2xl px-4 py-3',
                      m.fromPlatform ? 'mr-8 bg-[var(--accent)]/10' : 'ml-8 bg-slate-50',
                    )}
                  >
                    <p className="text-xs text-slate-500">
                      {m.author} · {fmt(m.createdAt)}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
              </ol>
              {t.status !== 'CLOSED' && (
                <div className="mt-3">
                  <ReplyForm endpoint={`/support/tickets/${t.id}/reply`} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
