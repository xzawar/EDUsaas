import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { ApplyLeaveButton, MyLeaveList } from '@/components/leave/LeaveViews';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock } from '@/server/school/common';
import { leaveTypes, myLeave } from '@/server/school/leave';

export const metadata: Metadata = { title: 'Leave' };

export default async function StudentLeavePage() {
  const ctx = await requirePortal('STUDENT');
  const [types, mine, clock] = await Promise.all([leaveTypes(ctx), myLeave(ctx), inTenant(ctx, (tx) => schoolClock(tx))]);
  return (
    <>
      <PageHeader
        title="Leave"
        description="Ask for leave here. Your Class Incharge decides; approved days don’t count against your attendance."
        actions={<ApplyLeaveButton types={types.map((t) => ({ id: t.id, name: t.name }))} today={clock.today} />}
      />
      <Card>
        <MyLeaveList rows={JSON.parse(JSON.stringify(mine))} />
      </Card>
    </>
  );
}
