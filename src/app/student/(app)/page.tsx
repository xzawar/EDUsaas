import { CalendarCheck, NotebookPen, Plane } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LatestAnnouncements } from '@/components/comms/LatestAnnouncements';
import { AreaTrend } from '@/components/dashboard/AreaTrend';
import {
  DayTimeline,
  MiniCalendar,
  Panel,
  PanelLink,
  PastelStat,
  TONE_ORDER,
  type DayMark,
} from '@/components/dashboard/widgets';
import { Badge } from '@/components/ui';
import { weeklyAttendance } from '@/lib/attendance-weeks';
import { requirePortal } from '@/server/auth/page';
import { studentResults } from '@/server/school/assessments';
import { studentAttendance } from '@/server/school/attendance';
import { inTenant } from '@/server/school/common';
import { studentOverview } from '@/server/school/dashboard';
import { todayLessons } from '@/server/school/timetable';

export const metadata: Metadata = { title: 'Home' };

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

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
  const first = ctx.user.displayName.split(' ')[0];
  const weeks = att ? weeklyAttendance(att.byDay) : [];
  const low = weeks.length ? Math.min(...weeks.map((w) => w.value)) : 0;
  const yMin = Math.max(0, Math.min(50, Math.floor((low - 10) / 10) * 10));
  const latestBySubject = new Map<string, string>();
  for (const i of results.items) if (!latestBySubject.has(i.subject)) latestBySubject.set(i.subject, i.heldOn);
  const marks: Record<string, DayMark> = {};
  for (const [day, st] of Object.entries(att?.byDay ?? {}))
    if (st === 'ABSENT') marks[day] = 'absent';
    else if (st === 'LATE') marks[day] = 'late';
    else if (st === 'LEAVE' || st === 'EXCUSED') marks[day] = 'leave';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Hello, {first} 👋</h1>
          <p className="mt-1 text-sm text-slate-500">
            {d?.section ? `Class ${d.section}` : ctx.session.tenant?.name}
            {d?.rollNumber ? ` · Roll no. ${d.rollNumber}` : ''} · Here’s how your term is going.
          </p>
        </header>

        <LatestAnnouncements ctx={ctx} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <PastelStat
            tone="violet"
            title="Attendance"
            ring={att?.pct ?? null}
            caption={
              att?.pct === null || !att
                ? 'Not recorded yet'
                : att.pct >= att.threshold
                  ? `On track · target ${att.threshold}%`
                  : `Below the ${att.threshold}% target`
            }
            href="/student/attendance"
          />
          {results.subjects.slice(0, 2).map((s, i) => (
            <PastelStat
              key={s.subject}
              tone={TONE_ORDER[(i + 1) % TONE_ORDER.length]!}
              title={s.subject}
              ring={s.pct}
              caption={
                latestBySubject.get(s.subject) ? `Latest test ${shortDay(latestBySubject.get(s.subject)!)}` : undefined
              }
              value={s.grade ? `Grade ${s.grade}` : undefined}
              href="/student/marks"
            />
          ))}
          {results.subjects.length === 0 && (
            <PastelStat
              tone="pink"
              title="No marks yet"
              caption="Published test results show here"
              icon={<NotebookPen className="size-6" />}
              href="/student/marks"
            />
          )}
        </div>

        <Panel title="Your attendance, week by week" action={<PanelLink href="/student/attendance">Details</PanelLink>}>
          <AreaTrend
            points={weeks}
            target={att?.threshold}
            yMin={yMin}
            caption="Your attendance percentage per school week"
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Latest marks" action={<PanelLink href="/student/marks">All marks</PanelLink>}>
            {results.items.length ? (
              <ul className="space-y-1">
                {results.items.slice(0, 5).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.subject}</span>
                      <span className="block text-xs text-slate-500">
                        {r.name} · {shortDate(r.heldOn)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {r.absent ? 'Absent' : `${r.score}/${r.maxMarks}`}
                      </span>
                      {r.grade && <Badge tone="blue">{r.grade}</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">No published marks yet.</p>
            )}
          </Panel>
          <Panel title="My subjects">
            {d?.subjects.length ? (
              <ul className="space-y-1">
                {d.subjects.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="truncate text-slate-500">{s.teacher ?? '—'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">Your class subjects aren’t set up yet.</p>
            )}
          </Panel>
        </div>
      </div>

      {/* Right rail */}
      <aside className="space-y-6">
        <Panel>
          <MiniCalendar today={lessons.today} marks={marks} />
        </Panel>
        <Panel title={`${lessons.dayName}`} action={<PanelLink href="/student/timetable">Week</PanelLink>}>
          <DayTimeline
            lessons={lessons.lessons}
            now={lessons.now}
            schoolDay={lessons.schoolDay}
            dayName={lessons.dayName}
          />
        </Panel>
        <Panel title="Quick links">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Link
              href="/student/leave"
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 font-medium hover:bg-slate-100"
            >
              <Plane className="size-4 text-slate-500" aria-hidden /> Apply for leave
            </Link>
            <Link
              href="/student/attendance"
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 font-medium hover:bg-slate-100"
            >
              <CalendarCheck className="size-4 text-slate-500" aria-hidden /> My attendance
            </Link>
          </div>
          {d?.classTeacher && <p className="mt-3 text-xs text-slate-500">Class Incharge: {d.classTeacher}</p>}
        </Panel>
      </aside>
    </div>
  );
}
