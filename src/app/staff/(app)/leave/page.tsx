import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { ApplyLeaveButton, ApprovalList, MyLeaveList } from '@/components/leave/LeaveViews';
import { Card, TabLinks } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock, teacherScope } from '@/server/school/common';
import { approvalQueue, leaveTypes, myLeave, pendingApprovals } from '@/server/school/leave';

export const metadata: Metadata = { title: 'Leave' };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requirePortal('STAFF');
  const { tab } = await searchParams;
  const isIncharge =
    ctx.user.role === 'TEACHER' &&
    (await inTenant(ctx, (tx) => teacherScope(tx, ctx.user.id))).inchargeSectionIds.length > 0;
  const canApprove =
    ctx.user.role === 'SCHOOL_ADMIN' || (ctx.user.role === 'PRINCIPAL' && ctx.can('leave.approve')) || isIncharge;
  const canApply = ctx.can('leave.apply');
  const waiting = canApprove ? await pendingApprovals(ctx) : 0;
  // With no tab chosen, open on the requests waiting for a decision, if there are any.
  const active =
    tab === 'approve' && canApprove
      ? 'approve'
      : tab === 'history' && canApprove
        ? 'history'
        : tab === 'mine' && canApply
          ? 'mine'
          : !tab && waiting > 0
            ? 'approve'
            : canApply
              ? 'mine'
              : 'approve';
  const [types, mine, queue, clock] = await Promise.all([
    canApply ? leaveTypes(ctx) : Promise.resolve([]),
    active === 'mine' ? myLeave(ctx) : Promise.resolve([]),
    active !== 'mine' ? approvalQueue(ctx, active === 'history' ? 'DECIDED' : 'PENDING') : Promise.resolve([]),
    inTenant(ctx, (tx) => schoolClock(tx)),
  ]);
  const tabs = [
    ...(canApply ? [{ key: 'mine', label: 'My leave', href: '/staff/leave?tab=mine' }] : []),
    ...(canApprove
      ? [
          { key: 'approve', label: 'To approve', href: '/staff/leave?tab=approve', count: waiting || undefined },
          { key: 'history', label: 'Decided', href: '/staff/leave?tab=history' },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        title="Leave"
        description={
          canApprove
            ? 'Your own requests, and requests waiting for your decision.'
            : 'Request leave and see the decision here.'
        }
        actions={
          canApply ? (
            <ApplyLeaveButton types={types.map((t) => ({ id: t.id, name: t.name }))} today={clock.today} />
          ) : undefined
        }
      />
      <Card>
        {tabs.length > 1 && (
          <div className="mb-2">
            <TabLinks tabs={tabs} active={active} />
          </div>
        )}
        {active === 'mine' ? (
          <MyLeaveList rows={JSON.parse(JSON.stringify(mine))} />
        ) : (
          <ApprovalList rows={JSON.parse(JSON.stringify(queue))} />
        )}
      </Card>
    </>
  );
}
