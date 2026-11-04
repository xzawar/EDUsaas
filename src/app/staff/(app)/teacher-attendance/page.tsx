import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { TeacherBoard } from '@/components/attendance/TeacherBoard';
import { Card, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { teacherBoard } from '@/server/school/attendance';

export const metadata: Metadata = { title: 'Teacher check-ins' };

export default async function TeacherAttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await requirePortal('STAFF', 'teacher_attendance.oversee');
  const { date } = await searchParams;
  const b = await teacherBoard(ctx, date);
  return (
    <>
      <PageHeader
        title="Teacher check-ins"
        description="Teachers check in from their Today page. You can correct any day."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Present" value={b.summary.present} />
        <Stat label="Late" value={b.summary.late} />
        <Stat label="Absent / leave" value={b.summary.absent + b.summary.leave} />
        <Stat label="Not checked in" value={b.summary.missing} hint={`of ${b.summary.total} teachers`} />
      </div>
      <Card>
        <TeacherBoard date={b.date} today={b.today} rows={JSON.parse(JSON.stringify(b.list))} timezone={b.timezone} />
      </Card>
    </>
  );
}
