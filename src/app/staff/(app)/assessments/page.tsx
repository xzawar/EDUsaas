import { ClipboardList } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { NewTestButton } from '@/components/marks/NewTest';
import { RemarksQueue } from '@/components/marks/RemarksQueue';
import { Badge, Card, EmptyState, TabLinks, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { canViewMarks, listAssessments, remarksQueue, teachOptions } from '@/server/school/assessments';
import { inTenant, schoolClock } from '@/server/school/common';

export const metadata: Metadata = { title: 'Tests & marks' };
const TONE = { DRAFT: 'slate', SUBMITTED: 'blue', PUBLISHED: 'green' } as const;
const LABEL = { DRAFT: 'Draft', SUBMITTED: 'To publish', PUBLISHED: 'Published' } as const;

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePortal('STAFF');
  if (!canViewMarks(ctx)) redirect('/staff');
  const { tab } = await searchParams;
  const active = tab === 'publish' || tab === 'remarks' ? tab : 'all';
  const [items, options, remarks, clock] = await Promise.all([
    listAssessments(ctx, active === 'publish' ? { status: 'SUBMITTED' } : {}),
    teachOptions(ctx),
    remarksQueue(ctx),
    inTenant(ctx, (tx) => schoolClock(tx)),
  ]);
  const canPublish =
    ctx.user.role === 'SCHOOL_ADMIN' || (ctx.user.role === 'PRINCIPAL' && clock.marksPublisher === 'PRINCIPAL');
  return (
    <>
      <PageHeader
        title="Tests & marks"
        description="Create a test, enter marks, submit. Students see marks after they’re published."
        actions={<NewTestButton options={options} today={clock.today} />}
      />
      <Card>
        <div className="mb-2">
          <TabLinks
            active={active}
            tabs={[
              { key: 'all', label: 'All tests', href: '/staff/assessments' },
              ...(canPublish
                ? [{ key: 'publish', label: 'Ready to publish', href: '/staff/assessments?tab=publish' }]
                : []),
              {
                key: 'remarks',
                label: 'Remarks to review',
                href: '/staff/assessments?tab=remarks',
                count: remarks.length,
              },
            ]}
          />
        </div>
        {active === 'remarks' ? (
          <RemarksQueue rows={JSON.parse(JSON.stringify(remarks))} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={active === 'publish' ? 'Nothing waiting to publish' : 'No tests yet'}
            description={options.length ? 'Use “New test” to create one.' : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Test</Th>
                <Th>Class</Th>
                <Th className="hidden sm:table-cell">Date</Th>
                <Th className="hidden sm:table-cell text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/staff/assessments/${a.id}`} className="font-medium hover:text-[var(--accent)]">
                      {a.name}
                    </Link>
                    <span className="block text-xs text-slate-500">{a.subject}</span>
                  </Td>
                  <Td>
                    <Badge>{a.section}</Badge>
                  </Td>
                  <Td className="hidden text-slate-600 sm:table-cell">
                    {new Date(`${a.heldOn}T00:00:00Z`).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </Td>
                  <Td className="hidden text-right tabular-nums sm:table-cell">{a.maxMarks}</Td>
                  <Td>
                    <Badge tone={TONE[a.status]}>{LABEL[a.status]}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
