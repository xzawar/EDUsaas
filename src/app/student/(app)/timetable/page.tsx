import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { TimetableGrid } from '@/components/timetable/TimetableGrid';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock, weekday } from '@/server/school/common';
import { myTimetable } from '@/server/school/timetable';

export const metadata: Metadata = { title: 'Timetable' };

export default async function StudentTimetablePage() {
  const ctx = await requirePortal('STUDENT');
  const [grid, clock] = await Promise.all([myTimetable(ctx), inTenant(ctx, (tx) => schoolClock(tx))]);
  return (
    <>
      <PageHeader title="Timetable" description="Your class’s weekly timetable. Today is highlighted." />
      <Card>
        <TimetableGrid grid={grid} today={weekday(clock.today)} />
      </Card>
    </>
  );
}
