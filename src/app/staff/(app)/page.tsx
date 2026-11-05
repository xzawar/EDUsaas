import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  GraduationCap,
  Layers,
  NotebookPen,
  Plane,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { actionLabel } from '@/lib/audit-labels';
import { LatestAnnouncements } from '@/components/comms/LatestAnnouncements';
import { listSupportGrants } from '@/server/school/support';
import Link from 'next/link';
import { BarList, Meter } from '@/components/charts';
import { AreaTrend } from '@/components/dashboard/AreaTrend';
import {
  DayTimeline,
  MiniCalendar,
  Panel,
  PanelLink,
  PastelStat,
  TONE_ORDER,
  TONES,
  TodoItem,
} from '@/components/dashboard/widgets';
import { CheckInCard } from '@/components/dashboard/CheckInCard';
import { Badge, ButtonLink, EmptyState, ROLE_LABELS, cx } from '@/components/ui';
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

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

function Greeting({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title} 👋</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

async function SchoolDashboard({ ctx }: { ctx: AuthedContext }) {
  const supportPending =
    ctx.can('settings.manage') && (await listSupportGrants(ctx)).some((g) => g.status === 'PENDING');
  const [d, att, board, approvals, toPublish, clock] = await Promise.all([
    schoolOverview(ctx),
    ctx.can('attendance.oversee') ? attendanceOverview(ctx) : Promise.resolve(null),
    ctx.can('teacher_attendance.oversee') ? teacherBoard(ctx) : Promise.resolve(null),
    pendingApprovals(ctx),
    ctx.user.role === 'SCHOOL_ADMIN' || ctx.user.role === 'PRINCIPAL' ? unpublishedCount(ctx) : Promise.resolve(0),
    inTenant(ctx, (tx) => schoolClock(tx)),
  ]);
  const done = d.checklist.filter((c) => c.done).length;
  const setupComplete = done === d.checklist.length;
  const checkedIn = board ? board.summary.present + board.summary.late : 0;
  const trend = (att?.trend ?? []).map((t) => ({
    label: dayLabel(t.day, { day: 'numeric', month: 'short' }),
    value: t.pct,
    detail: dayLabel(t.day, { weekday: 'short', day: 'numeric', month: 'short' }),
  }));
  const low = trend.length ? Math.min(...trend.map((t) => t.value)) : 0;
  const yMin = Math.max(0, Math.min(50, Math.floor((low - 10) / 10) * 10));
  const hasTodo = supportPending || approvals > 0 || toPublish > 0 || (att?.pending.length ?? 0) > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Greeting
          title={greeting(ctx.user.displayName)}
          subtitle={`${ROLE_LABELS[ctx.user.role]} · ${ctx.session.tenant?.name}${d.year ? ` · ${d.year.name}` : ''}`}
          actions={
            <>
              {ctx.can('students.write') && (
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

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <PastelStat
            tone="violet"
            title="Attendance today"
            ring={att?.todayPct ?? null}
            caption={att ? `${att.todayCounts.ABSENT} absent · ${att.todayCounts.LATE} late` : 'No current year'}
            href={ctx.can('reports.read') ? '/staff/reports' : undefined}
          />
          <PastelStat
            tone="pink"
            title="Registers taken"
            ring={att ? pct(att.sectionsSubmitted, att.sectionsTotal) : null}
            value={att ? `${att.sectionsSubmitted} of ${att.sectionsTotal} sections` : undefined}
            href="/staff/attendance"
          />
          <PastelStat
            tone="sky"
            title="Teachers in"
            ring={board ? pct(checkedIn, board.summary.total) : null}
            value={board ? `${checkedIn} of ${board.summary.total} · ${board.summary.late} late` : undefined}
            href={board ? '/staff/teacher-attendance' : undefined}
          />
          <PastelStat
            tone="mint"
            title="Students"
            icon={<GraduationCap className="size-6" />}
            value={d.counts.students.toLocaleString()}
            caption={`${d.counts.teachers} teachers · ${d.counts.sections} sections`}
            href="/staff/students"
          />
        </div>

        {hasTodo && (
          <Panel title="Needs you" className="xl:hidden">
            <div className="-mx-2 space-y-0.5">
              {supportPending && (
                <TodoItem href="/staff/settings#support" count={1} tone="violet">
                  EDUsaas support asks for access
                </TodoItem>
              )}
              {approvals > 0 && (
                <TodoItem href="/staff/leave?tab=approve" count={approvals} tone="amber">
                  leave request{approvals === 1 ? '' : 's'} to decide
                </TodoItem>
              )}
              {toPublish > 0 && (
                <TodoItem href="/staff/assessments?tab=publish" count={toPublish} tone="sky">
                  test{toPublish === 1 ? '' : 's'} ready to publish
                </TodoItem>
              )}
              {att && att.pending.length > 0 && (
                <TodoItem href="/staff/attendance" count={att.pending.length} tone="pink">
                  register{att.pending.length === 1 ? '' : 's'} not taken today
                </TodoItem>
              )}
            </div>
          </Panel>
        )}

        <LatestAnnouncements ctx={ctx} href="/staff/announcements" />

        {!setupComplete && ctx.user.role === 'SCHOOL_ADMIN' && (
          <Panel
            title="Set up your school"
            action={<span className="text-sm text-slate-500">{`${done} of ${d.checklist.length} done`}</span>}
          >
            <Meter value={done} max={d.checklist.length} label="Setup progress" />
            <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
              {d.checklist.map((c) => (
                <li key={c.key}>
                  <Link
                    href={c.href}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50"
                  >
                    {c.done ? (
                      <CheckCircle2 className="size-5 text-emerald-600" aria-label="Done" />
                    ) : (
                      <Circle className="size-5 text-slate-300" aria-label="To do" />
                    )}
                    <span className={c.done ? 'text-slate-400 line-through' : 'font-medium'}>{c.label}</span>
                    {!c.done && <ArrowRight className="ml-auto size-4 text-slate-400" />}
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {att && (
          <Panel
            title="Attendance, last 30 school days"
            action={ctx.can('reports.read') ? <PanelLink href="/staff/reports">Full report</PanelLink> : undefined}
          >
            <AreaTrend
              points={trend}
              target={att.threshold}
              yMin={yMin}
              caption="School-wide attendance percentage per school day"
            />
          </Panel>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="Students by class"
            action={<span className="text-sm text-slate-500">{d.year?.name ?? ''}</span>}
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
          </Panel>
          <Panel title="Recent admissions" action={<PanelLink href="/staff/students">View all</PanelLink>}>
            {d.recentAdmissions.length ? (
              <ul className="space-y-1">
                {d.recentAdmissions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/staff/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-slate-50"
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
          </Panel>
        </div>

        {(d.sectionsWithoutIncharge.length > 0 || d.sectionsWithoutTeachers.length > 0 || d.nearlyFull.length > 0) && (
          <Panel title="Needs attention">
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
          </Panel>
        )}
      </div>

      {/* Right rail */}
      <aside className="space-y-6">
        <Panel>
          <MiniCalendar today={clock.today} />
        </Panel>

        {hasTodo && (
          <Panel title="Needs you" className="hidden xl:block">
            <div className="-mx-2 space-y-0.5">
              {supportPending && (
                <TodoItem href="/staff/settings#support" count={1} tone="violet">
                  EDUsaas support asks for access
                </TodoItem>
              )}
              {approvals > 0 && (
                <TodoItem href="/staff/leave?tab=approve" count={approvals} tone="amber">
                  leave request{approvals === 1 ? '' : 's'} to decide
                </TodoItem>
              )}
              {toPublish > 0 && (
                <TodoItem href="/staff/assessments?tab=publish" count={toPublish} tone="sky">
                  test{toPublish === 1 ? '' : 's'} ready to publish
                </TodoItem>
              )}
              {att && att.pending.length > 0 && (
                <TodoItem href="/staff/attendance" count={att.pending.length} tone="pink">
                  register{att.pending.length === 1 ? '' : 's'} not taken today
                </TodoItem>
              )}
            </div>
          </Panel>
        )}

        {att && att.pending.length > 0 && (
          <Panel title="Registers not taken today">
            <ul className="flex flex-wrap gap-1.5">
              {att.pending.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/staff/attendance/${p.id}`}
                    title={p.incharge ?? 'No Class Incharge'}
                    className="inline-flex items-center rounded-lg bg-slate-50 px-2.5 py-1 text-sm font-semibold ring-1 ring-slate-200 hover:bg-white"
                  >
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Remind the Class Incharge, or take it yourself.</p>
          </Panel>
        )}

        {att && (
          <Panel
            id="at-risk"
            title="At risk"
            action={
              ctx.can('reports.read') ? (
                <PanelLink href="/staff/reports?tab=at-risk">All {att.atRiskCount}</PanelLink>
              ) : undefined
            }
          >
            {att.atRisk.length ? (
              <ul className="space-y-0.5">
                {att.atRisk.slice(0, 6).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/staff/students/${s.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl px-2 py-1.5 hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block text-xs text-slate-500">{s.section}</span>
                      </span>
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 tabular-nums">
                        {s.pct}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No students below {att.threshold}%.</p>
            )}
            <p className="mt-2 text-xs text-slate-500">Below {att.threshold}% this year, 10+ days recorded.</p>
          </Panel>
        )}

        {d.activity && (
          <Panel
            title="Recent activity"
            action={ctx.can('audit.read') ? <PanelLink href="/staff/audit">Audit log</PanelLink> : undefined}
          >
            <ul className="space-y-2.5 text-sm">
              {d.activity.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3">
                  <span className="text-slate-700">
                    {actionLabel(a.action)}
                    {a.actorRole && <span className="block text-xs text-slate-500">{ROLE_LABELS[a.actorRole]}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-slate-400" dateTime={a.createdAt.toISOString()}>
                    {relative(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
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
  const label = dayLabel(clock.today, { weekday: 'long', day: 'numeric', month: 'long' });
  const registersLeft = todo.filter((t) => !t.done);
  const doneToday = new Set(todo.filter((t) => t.done).map((t) => t.id));
  const takes = new Set(todo.map((t) => t.id));
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Greeting title={greeting(ctx.user.displayName)} subtitle={`${label} · ${ctx.session.tenant?.name}`} />

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {checkin && (
            <CheckInCard
              status={checkin.status}
              checkedInAt={checkin.checkedInAt ? checkin.checkedInAt.toISOString() : null}
              userId={ctx.user.id}
              timezone={clock.timezone}
            />
          )}
          <PastelStat
            tone="pink"
            title="Registers"
            ring={pct(todo.length - registersLeft.length, todo.length)}
            value={todo.length ? `${todo.length - registersLeft.length} of ${todo.length} taken today` : 'None to take'}
            href="/staff/attendance"
          />
          <PastelStat
            tone="amber"
            title="Leave requests"
            icon={<Plane className="size-6" />}
            value={approvals ? `${approvals} to decide` : 'All decided'}
            href="/staff/leave?tab=approve"
          />
          <PastelStat
            tone="sky"
            title="Marks"
            icon={<NotebookPen className="size-6" />}
            value={drafts ? `${drafts} test${drafts === 1 ? '' : 's'} to submit` : 'All submitted'}
            href="/staff/assessments"
          />
        </div>

        <LatestAnnouncements ctx={ctx} href="/staff/announcements" />

        <Panel title="My classes" action={<PanelLink href="/staff/students">My students</PanelLink>}>
          {!d || d.sections.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No classes assigned yet"
              description="Your School Admin will assign you to sections and subjects."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {d.sections.map((s, i) => {
                const tone = TONE_ORDER[i % TONE_ORDER.length]!;
                const taken = doneToday.has(s.id);
                return (
                  <li key={s.id} className={cx('flex flex-col rounded-2xl p-4', TONES[tone].card)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-lg leading-tight font-semibold">{s.label}</p>
                        <p className="truncate text-xs text-slate-600">
                          {s.subjects.length ? s.subjects.join(' · ') : 'Class Incharge'}
                        </p>
                      </div>
                      {s.isIncharge && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                          Incharge
                        </span>
                      )}
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-700">
                      <Users className="size-4" aria-hidden /> {s.students} students
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      {takes.has(s.id) && (
                        <Link
                          href={`/staff/attendance/${s.id}`}
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-medium',
                            taken ? 'bg-white/70 text-slate-700' : 'bg-slate-900 text-white hover:bg-slate-800',
                          )}
                        >
                          <ClipboardCheck className="size-4" aria-hidden /> {taken ? 'Register taken' : 'Take register'}
                        </Link>
                      )}
                      <Link
                        href={`/staff/students?sectionId=${s.id}`}
                        className="rounded-xl px-2 py-1.5 font-medium text-slate-700 hover:bg-white/60"
                      >
                        Students
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Right rail */}
      <aside className="space-y-6">
        <Panel>
          <MiniCalendar today={clock.today} />
        </Panel>
        <Panel title={lessons.dayName} action={<PanelLink href="/staff/timetable">Week</PanelLink>}>
          <DayTimeline
            lessons={lessons.lessons}
            now={lessons.now}
            schoolDay={lessons.schoolDay}
            dayName={lessons.dayName}
            showSection
          />
        </Panel>
        {(registersLeft.length > 0 || approvals > 0 || drafts > 0) && (
          <Panel title="To do today">
            <div className="-mx-2 space-y-0.5">
              {registersLeft.map((t) => (
                <TodoItem key={t.id} href={`/staff/attendance/${t.id}`} count={1} tone="pink">
                  Take attendance for <strong>{t.label}</strong>
                </TodoItem>
              ))}
              {approvals > 0 && (
                <TodoItem href="/staff/leave?tab=approve" count={approvals} tone="amber">
                  leave request{approvals === 1 ? '' : 's'} from your students
                </TodoItem>
              )}
              {drafts > 0 && (
                <TodoItem href="/staff/assessments" count={drafts} tone="sky">
                  test{drafts === 1 ? '' : 's'} with marks not submitted
                </TodoItem>
              )}
            </div>
          </Panel>
        )}
      </aside>
    </div>
  );
}
