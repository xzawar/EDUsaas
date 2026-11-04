import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { AttendanceRing } from '@/components/student/AttendanceRing';
import { MonthCalendar } from '@/components/student/MonthCalendar';
import { STATUS_STYLE } from '@/components/attendance/StatusPill';
import { Alert, Card, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { studentAttendance } from '@/server/school/attendance';
import { inTenant } from '@/server/school/common';

export const metadata: Metadata = { title: 'Attendance' };

function shift(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

export default async function StudentAttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const ctx = await requirePortal('STUDENT');
  const me = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
  );
  if (!me) return <Alert>Your student record isn’t set up yet. Please contact your school office.</Alert>;
  const a = await studentAttendance(ctx, me.id);
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : a.today.slice(0, 7);
  const nav = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50';
  return (
    <>
      <PageHeader
        title="Attendance"
        description="Present and Late count as attended. Approved leave and excused days don’t count against you."
      />
      {a.pct !== null && a.pct < a.threshold && (
        <div className="mb-4">
          <Alert tone="warning">
            Your attendance is below your school’s {a.threshold}% target. Please talk to your Class Incharge.
          </Alert>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center">
          <AttendanceRing pct={a.pct} threshold={a.threshold} size={150} />
          <div className="mt-4 grid w-full grid-cols-2 gap-2 text-sm">
            {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((k) => (
              <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-slate-600">{STATUS_STYLE[k]!.label}</span>
                <span className="font-semibold tabular-nums">{a.counts[k]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card
          className="lg:col-span-2"
          title={new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
          actions={
            <div className="flex gap-2">
              <Link className={nav} href={`?month=${shift(month, -1)}`}>
                ←
              </Link>
              {month < a.today.slice(0, 7) && (
                <Link className={nav} href={`?month=${shift(month, 1)}`}>
                  →
                </Link>
              )}
            </div>
          }
        >
          <MonthCalendar month={month} byDay={a.byDay} today={a.today} />
        </Card>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="School days recorded" value={Object.keys(a.byDay).length} />
        <Stat label="Target" value={`${a.threshold}%`} />
      </div>
    </>
  );
}
