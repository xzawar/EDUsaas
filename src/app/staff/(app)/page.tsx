import { ArrowRight, BookOpen, CheckCircle2, Circle, GraduationCap, Layers, UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { actionLabel } from '@/lib/audit-labels';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { BarList, Meter, TrendColumns } from '@/components/charts';
import { CheckInCard } from '@/components/dashboard/CheckInCard';
import { TodayLessons } from '@/components/dashboard/TodayLessons';
import { Badge, ButtonLink, Card, EmptyState, ROLE_LABELS, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import type { AuthedContext } from '@/server/http/route';
import { schoolOverview, teacherOverview } from '@/server/school/dashboard';
import { attendanceOverview, myCheckIn, teacherAttendanceTodo, teacherBoard } from '@/server/school/attendance';
import { pendingApprovals } from '@/server/school/leave';
import { teacherMarksTodo, unpublishedCount } from '@/server/school/assessments';
import { todayLessons } from '@/server/school/timetable';
import { inTenant, schoolClock } from '@/server/school/common';

export const metadata: Metadata = { title: 'Dashboard' };

function greeting(name: string) {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Karachi' }).format(new Date()),
  );
  return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name.split(' ')[0]}`;
}

export default async function StaffDashboard() {
  const ctx = await requirePortal('STAFF');
  return ctx.user.role === 'TEACHER' ? <TeacherToday ctx={ctx} /> : <SchoolDashboard ctx={ctx} />;
}

async function SchoolDashboard({ ctx }: { ctx: AuthedContext }) {
  const [d, att, board, approvals, toPublish] = await Promise.all([
    schoolOverview(ctx),
    ctx.can('attendance.oversee') ? attendanceOverview(ctx) : Promise.resolve(null),
    ctx.can('teacher_attendance.oversee') ? teacherBoard(ctx) : Promise.resolve(null),
    pendingApprovals(ctx),
    ctx.user.role === 'SCHOOL_ADMIN' || ctx.user.role === 'PRINCIPAL' ? unpublishedCount(ctx) : Promise.resolve(0),
  ]);
  const done = d.checklist.filter((c) => c.done).length;
  const setupComplete = done === d.checklist.length;
  const canAdmit = ctx.can('students.write');

  return (
    <>
      <PageHeader
        title={greeting(ctx.user.displayName)}
        description={`${ROLE_LABELS[ctx.user.role]} · ${ctx.session.tenant?.name}${d.year ? ` · ${d.year.name}` : ''}`}
        actions={
          <>
            {canAdmit && (
              <ButtonLink href="/staff/students?new=1">
                <UserPlus className="size-4" /> Admit student
              </ButtonLink>
            )}
            {ctx.can('teachers.write') && (
              <ButtonLink href="/staff/teachers?new=1" variant="secondary">
                Add teacher
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active students"
          value={d.counts.students.toLocaleString()}
          hint={`${d.counts.teachers} teachers · ${d.counts.sections} sections`}
        />
        <Stat
          label="Attendance today"
          value={att?.todayPct !== null && att?.todayPct !== undefined ? `${att.todayPct}%` : '—'}
          hint={att ? `${att.todayCounts.ABSENT} absent · ${att.todayCounts.LATE} late` : 'No current year'}
        />
        <Stat
          label="Registers taken"
          value={att ? `${att.sectionsSubmitted} / ${att.sectionsTotal}` : '—'}
          hint={att && att.pending.length ? `${att.pending.length} still to take` : 'All done'}
        />
        <Stat
          label="Teachers checked in"
          value={board ? `${board.summary.present + board.summary.late} / ${board.summary.total}` : '—'}
          hint={board ? `${board.summary.late} late` : undefined}
        />
      </div>

      {(approvals > 0 || toPublish > 0 || (att?.atRiskCount ?? 0) > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {approvals > 0 && (
            <Link
              href="/staff/leave?tab=approve"
              className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-200"
            >
              {approvals} leave request{approvals === 1 ? '' : 's'} to decide →
            </Link>
          )}
          {toPublish > 0 && (
            <Link
              href="/staff/assessments?tab=publish"
              className="rounded-full bg-sky-100 px-3 py-1.5 text-sm font-medium text-sky-900 ring-1 ring-sky-200 hover:bg-sky-200"
            >
              {toPublish} test{toPublish === 1 ? '' : 's'} ready to publish →
            </Link>
          )}
          {att && att.atRiskCount > 0 && (
            <a
              href="#at-risk"
              className="rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-900 ring-1 ring-red-200 hover:bg-red-200"
            >
              {att.atRiskCount} student{att.atRiskCount === 1 ? '' : 's'} below {att.threshold}% attendance →
            </a>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {!setupComplete && ctx.user.role === 'SCHOOL_ADMIN' && (
            <Card title="Set up your school" description={`${done} of ${d.checklist.length} steps done`}>
              <Meter value={done} max={d.checklist.length} label="Setup progress" />
              <ul className="mt-4 divide-y divide-slate-100">
                {d.checklist.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="flex items-center gap-3 py-2.5 text-sm hover:text-[var(--accent)]">
                      {c.done ? (
                        <CheckCircle2 className="size-5 text-emerald-600" aria-label="Done" />
                      ) : (
                        <Circle className="size-5 text-slate-300" aria-label="To do" />
                      )}
                      <span className={c.done ? 'text-slate-500 line-through' : 'font-medium'}>{c.label}</span>
                      {!c.done && <ArrowRight className="ml-auto size-4 text-slate-400" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {att && (
            <Card title="Attendance, last 30 school days" description="Share of students present or late each day.">
              <TrendColumns
                points={att.trend}
                target={att.threshold}
                caption="Daily attendance percentage for the last 30 school days"
              />
            </Card>
          )}

          {att && att.pending.length > 0 && (
            <Card title="Registers not taken today" description="Remind the Class Incharge, or take it yourself.">
              <ul className="flex flex-wrap gap-2">
                {att.pending.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/staff/attendance/${p.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:border-[var(--accent)]/40"
                    >
                      <span className="font-semibold">{p.label}</span>
                      <span className="text-slate-500">{p.incharge ?? 'no incharge'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Students by class"
            description={d.year ? `Active students in ${d.year.name}` : 'No current academic year'}
          >
            {d.classes.length ? (
              <BarList
                caption="Active students per class"
                unit="students"
                rows={d.classes.map((c) => ({
                  label: c.name,
                  value: c.students,
                  hint: `${c.sections} section${c.sections === 1 ? '' : 's'}${c.capacity ? `, capacity ${c.capacity}` : ''}`,
                }))}
              />
            ) : (
              <EmptyState
                icon={<Layers className="size-5" />}
                title="No classes yet"
                description="Create classes and sections for the current academic year."
                action={
                  ctx.can('structure.manage') ? (
                    <ButtonLink href="/staff/academics">Set up classes</ButtonLink>
                  ) : undefined
                }
              />
            )}
          </Card>

          {(d.sectionsWithoutIncharge.length > 0 ||
            d.sectionsWithoutTeachers.length > 0 ||
            d.nearlyFull.length > 0) && (
            <Card title="Needs attention">
              <ul className="space-y-3 text-sm">
                {d.sectionsWithoutIncharge.length > 0 && (
                  <li className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">No Class Incharge</Badge>
                    <span className="text-slate-700">{d.sectionsWithoutIncharge.join(', ')}</span>
                  </li>
                )}
                {d.sectionsWithoutTeachers.length > 0 && (
                  <li className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">No teachers assigned</Badge>
                    <span className="text-slate-700">{d.sectionsWithoutTeachers.join(', ')}</span>
                  </li>
                )}
                {d.nearlyFull.length > 0 && (
                  <li className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">Nearly full</Badge>
                    <span className="text-slate-700">
                      {d.nearlyFull.map((s) => `${s.label} (${s.students}/${s.capacity})`).join(', ')}
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {att && (
            <div id="at-risk">
              <Card title="At risk" description={`Below ${att.threshold}% attendance this year (10+ days recorded).`}>
                {att.atRisk.length ? (
                  <ul className="divide-y divide-slate-100">
                    {att.atRisk.slice(0, 8).map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/staff/students/${s.id}`}
                          className="flex items-center justify-between gap-3 py-2 hover:text-[var(--accent)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{s.name}</span>
                            <span className="block text-xs text-slate-500">{s.section}</span>
                          </span>
                          <span className="text-sm font-semibold text-red-700 tabular-nums">{s.pct}%</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No students below the target.</p>
                )}
              </Card>
            </div>
          )}

          <Card
            title="Recent admissions"
            actions={
              <Link href="/staff/students" className="text-sm font-medium text-[var(--accent)] hover:underline">
                View all
              </Link>
            }
          >
            {d.recentAdmissions.length ? (
              <ul className="divide-y divide-slate-100">
                {d.recentAdmissions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/staff/students/${s.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--accent)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate font-mono text-xs text-slate-500">{s.username}</span>
                      </span>
                      <Badge>{s.section}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<GraduationCap className="size-5" />} title="No students yet" />
            )}
          </Card>

          {d.activity && (
            <Card title="Recent activity" actions={ctx.can('audit.read') ? undefined : undefined}>
              <ul className="space-y-2.5 text-sm">
                {d.activity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3">
                    <span className="text-slate-700">
                      {actionLabel(a.action)}
                      {a.outcome !== 'success' && <span className="ml-1.5 text-xs text-red-700">({a.outcome})</span>}
                      {a.actorRole && <span className="block text-xs text-slate-500">{ROLE_LABELS[a.actorRole]}</span>}
                    </span>
                    <time className="shrink-0 text-xs text-slate-500" dateTime={a.createdAt.toISOString()}>
                      {relative(a.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Your access" description="Configured by your School Admin.">
            <p className="text-sm text-slate-600">
              You have {ctx.permissions.size} permissions as {ROLE_LABELS[ctx.user.role]}.
              {ctx.user.role === 'SCHOOL_ADMIN' && (
                <>
                  {' '}
                  <Link href="/staff/settings#permissions" className="font-medium text-[var(--accent)] hover:underline">
                    Manage Principal and Admissions access
                  </Link>
                </>
              )}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function relative(d: Date) {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function TeacherToday({ ctx }: { ctx: AuthedContext }) {
  const [d, checkin, todo, lessons, approvals, drafts, clock] = await Promise.all([
    teacherOverview(ctx),
    myCheckIn(ctx),
    teacherAttendanceTodo(ctx),
    todayLessons(ctx),
    pendingApprovals(ctx),
    teacherMarksTodo(ctx),
    inTenant(ctx, (tx) => schoolClock(tx)),
  ]);
  const label = new Date(`${clock.today}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const registersLeft = todo.filter((t) => !t.done);
  return (
    <>
      <PageHeader title={greeting(ctx.user.displayName)} description={`${label} · ${ctx.session.tenant?.name}`} />
      <div className="space-y-6">
        {checkin && (
          <CheckInCard
            status={checkin.status}
            checkedInAt={checkin.checkedInAt ? checkin.checkedInAt.toISOString() : null}
            userId={ctx.user.id}
            timezone={clock.timezone}
          />
        )}

        {(registersLeft.length > 0 || approvals > 0 || drafts > 0) && (
          <Card title="To do today">
            <ul className="divide-y divide-slate-100">
              {registersLeft.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/staff/attendance/${t.id}`}
                    className="flex items-center justify-between py-2.5 text-sm hover:text-[var(--accent)]"
                  >
                    <span>
                      Take attendance for <strong>{t.label}</strong>
                    </span>
                    <ArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              ))}
              {approvals > 0 && (
                <li>
                  <Link
                    href="/staff/leave?tab=approve"
                    className="flex items-center justify-between py-2.5 text-sm hover:text-[var(--accent)]"
                  >
                    <span>
                      <strong>{approvals}</strong> leave request{approvals === 1 ? '' : 's'} from your students
                    </span>
                    <ArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              )}
              {drafts > 0 && (
                <li>
                  <Link
                    href="/staff/assessments"
                    className="flex items-center justify-between py-2.5 text-sm hover:text-[var(--accent)]"
                  >
                    <span>
                      <strong>{drafts}</strong> test{drafts === 1 ? '' : 's'} with marks not submitted
                    </span>
                    <ArrowRight className="size-4 text-slate-400" />
                  </Link>
                </li>
              )}
            </ul>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card
            title="Today’s lessons"
            actions={
              <Link href="/staff/timetable" className="text-sm font-medium text-[var(--accent)] hover:underline">
                Week
              </Link>
            }
          >
            <TodayLessons
              lessons={lessons.lessons}
              now={lessons.now}
              schoolDay={lessons.schoolDay}
              dayName={lessons.dayName}
              showSection
            />
          </Card>
          <Card title="My classes">
            {!d || d.sections.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="size-5" />}
                title="No classes assigned yet"
                description="Your School Admin will assign you to sections and subjects."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.sections.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/staff/students?sectionId=${s.id}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:text-[var(--accent)]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          {s.label} {s.isIncharge && <Badge tone="green">Incharge</Badge>}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {s.subjects.length ? s.subjects.join(' · ') : 'Class Incharge only'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-sm text-slate-500">
                        <Users className="size-4" aria-hidden /> {s.students}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
