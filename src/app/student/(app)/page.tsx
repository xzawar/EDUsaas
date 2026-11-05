import { ArrowRight, BookOpen } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { TodayLessons } from '@/components/dashboard/TodayLessons';
import { AttendanceRing } from '@/components/student/AttendanceRing';
import { Card, EmptyState, KeyValue } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { studentResults } from '@/server/school/assessments';
import { studentAttendance } from '@/server/school/attendance';
import { inTenant } from '@/server/school/common';
import { studentOverview } from '@/server/school/dashboard';
import { todayLessons } from '@/server/school/timetable';

export const metadata: Metadata = { title: 'Home' };

export default async function StudentHome() {
  const ctx = await requirePortal('STUDENT');
  const me = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
  );
  const [d, att, lessons, results] = await Promise.all([
    studentOverview(ctx),
    me ? studentAttendance(ctx, me.id) : Promise.resolve(null),
    todayLessons(ctx),
    me ? studentResults(ctx, me.id) : Promise.resolve({ items: [], subjects: [] }),
  ]);
  const link = 'text-sm font-medium text-[var(--accent)] hover:underline';
  return (
    <>
      <PageHeader
        title={`Hello, ${ctx.user.displayName.split(' ')[0]}`}
        description={`${d?.section ? `Class ${d.section}` : ctx.session.tenant?.name}${d?.rollNumber ? ` · Roll no. ${d.rollNumber}` : ''}`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Attendance"
          actions={
            <Link href="/student/attendance" className={link}>
              Details
            </Link>
          }
        >
          <div className="flex flex-col items-center py-2">
            <AttendanceRing pct={att?.pct ?? null} threshold={att?.threshold ?? 75} />
            <p className="mt-3 text-center text-sm text-slate-600">
              {att?.pct === null || !att
                ? 'No attendance recorded yet.'
                : att.pct >= att.threshold
                  ? `On track (target ${att.threshold}%).`
                  : `Below the ${att.threshold}% target.`}
            </p>
          </div>
        </Card>
        <Card
          title="Today"
          actions={
            <Link href="/student/timetable" className={link}>
              Week
            </Link>
          }
        >
          <TodayLessons
            lessons={lessons.lessons}
            now={lessons.now}
            schoolDay={lessons.schoolDay}
            dayName={lessons.dayName}
          />
        </Card>
        <Card
          title="Latest marks"
          actions={
            <Link href="/student/marks" className={link}>
              All marks
            </Link>
          }
        >
          {results.items.length ? (
            <ul className="divide-y divide-slate-100">
              {results.items.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block text-xs text-slate-500">{r.subject}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{r.grade ?? '—'}</span>
                    <span className="block text-xs text-slate-500 tabular-nums">
                      {r.absent ? 'Absent' : `${r.score}/${r.maxMarks}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<BookOpen className="size-5" />} title="No marks yet" />
          )}
        </Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="My subjects">
          {d?.subjects.length ? (
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {d.subjects.map((s) => (
                <li key={s.name} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="truncate text-slate-500">{s.teacher ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Your class subjects aren’t set up yet.</p>
          )}
        </Card>
        <Card title="My account">
          <KeyValue
            items={[
              [
                'Username',
                <span key="u" className="font-mono">
                  {ctx.user.username}
                </span>,
              ],
              ['Class Incharge', d?.classTeacher ?? 'Not assigned'],
            ]}
          />
          <Link
            href="/student/leave"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Apply for leave <ArrowRight className="size-4" />
          </Link>
        </Card>
      </div>
    </>
  );
}
