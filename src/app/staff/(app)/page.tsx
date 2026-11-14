import {
  AlertTriangle,
  Armchair,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Layers,
  Megaphone,
  NotebookPen,
  Plane,
  Upload,
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
  type Tone,
} from '@/components/dashboard/widgets';
import { CheckInCard } from '@/components/dashboard/CheckInCard';
import { Badge, ButtonLink, EmptyState, ROLE_LABELS, cx } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import type { AuthedContext } from '@/server/http/route';
import { admissionsOverview, schoolOverview, subjectAverages, teacherOverview } from '@/server/school/dashboard';
import { tenantSubscription } from '@/server/platform/plans';
import { financeOverview } from '@/server/school/finance/overview';
import { FinanceOverview } from '@/components/finance/FinanceOverview';
import { formatPKR } from '@/lib/money';
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
  if (ctx.user.role === 'TEACHER') return <TeacherToday ctx={ctx} />;
  if (ctx.user.role === 'PRINCIPAL') return <PrincipalDashboard ctx={ctx} />;
  if (ctx.user.role === 'ADMISSIONS_OFFICER') return <AdmissionsDashboard ctx={ctx} />;
  if (ctx.user.role === 'ACCOUNTANT') return <AccountantDashboard ctx={ctx} />;
  return <AdminDashboard ctx={ctx} />;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

type Todo = { href: string; count: number; tone: Tone; text: string };

/** "Needs you": shown in the right rail on wide screens and at the top on smaller ones. */
function NeedsYou({ items, className }: { items: Todo[]; className?: string }) {
  return (
    <Panel title="Needs you" className={className}>
      {items.length ? (
        <div className="-mx-2 space-y-0.5">
          {items.map((t) => (
            <TodoItem key={t.href + t.text} href={t.href} count={t.count} tone={t.tone}>
              {t.text}
            </TodoItem>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 py-2 text-sm text-slate-500">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> All done for now.
        </p>
      )}
    </Panel>
  );
}

function trendPoints(trend: { day: string; pct: number }[]) {
  const points = trend.map((t) => ({
    label: dayLabel(t.day, { day: 'numeric', month: 'short' }),
    value: t.pct,
    detail: dayLabel(t.day, { weekday: 'short', day: 'numeric', month: 'short' }),
  }));
  const low = points.length ? Math.min(...points.map((t) => t.value)) : 0;
  return { points, yMin: Math.max(0, Math.min(50, Math.floor((low - 10) / 10) * 10)) };
}

function RegistersPending({ pending }: { pending: { id: string; label: string; incharge: string | null }[] }) {
  if (!pending.length) return null;
  return (
    <Panel title="Registers not taken today">
      <ul className="flex flex-wrap gap-1.5">
        {pending.map((p) => (
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
  );
}

function AtRiskPanel({
  att,
  canReports,
}: {
  att: NonNullable<Awaited<ReturnType<typeof attendanceOverview>>>;
  canReports: boolean;
}) {
  return (
    <Panel
      id="at-risk"
      title="At risk"
      action={canReports ? <PanelLink href="/staff/reports?tab=at-risk">All {att.atRiskCount}</PanelLink> : undefined}
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
        <p className="text-sm text-slate-500">No students below {att.threshold}%. 🎉</p>
      )}
      <p className="mt-2 text-xs text-slate-500">Below {att.threshold}% this year, 10+ days recorded.</p>
    </Panel>
  );
}

function TeachersNotIn({ board }: { board: Awaited<ReturnType<typeof teacherBoard>> }) {
  const missing = board.list.filter((t) => t.status === null || t.status === 'ABSENT');
  const onLeave = board.list.filter((t) => t.status === 'LEAVE');
  return (
    <Panel title="Teachers today" action={<PanelLink href="/staff/teacher-attendance">Check-ins</PanelLink>}>
      {board.summary.total === 0 ? (
        <p className="text-sm text-slate-500">No teachers yet.</p>
      ) : missing.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> Every teacher is in or on leave.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            {plural(missing.length, 'teacher')} not checked in{onLeave.length ? ` · ${onLeave.length} on leave` : ''}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.slice(0, 12).map((t) => (
              <li key={t.teacherId} className="rounded-lg bg-slate-50 px-2.5 py-1 text-sm ring-1 ring-slate-200">
                {t.name}
              </li>
            ))}
            {missing.length > 12 && <li className="px-1 py-1 text-sm text-slate-500">+{missing.length - 12} more</li>}
          </ul>
        </>
      )}
    </Panel>
  );
}

function ActivityPanel({
  activity,
}: {
  activity: NonNullable<Awaited<ReturnType<typeof schoolOverview>>['activity']>;
}) {
  return (
    <Panel title="Recent activity" action={<PanelLink href="/staff/audit">Audit log</PanelLink>}>
      <ul className="space-y-2.5 text-sm">
        {activity.slice(0, 6).map((a) => (
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
  );
}

function RecentAdmissions({ rows }: { rows: Awaited<ReturnType<typeof schoolOverview>>['recentAdmissions'] }) {
  return (
    <Panel title="Recent admissions" action={<PanelLink href="/staff/students">All students</PanelLink>}>
      {rows.length ? (
        <ul className="space-y-1">
          {rows.map((s) => (
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
        <EmptyState
          icon={<GraduationCap className="size-5" />}
          title="No students yet"
          description="Students you admit or import show here, with their username for the login slip."
        />
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * School Admin: runs the school. Setup first for a new school; then today's operations, people and the plan.
 * ------------------------------------------------------------------------------------------------------------- */
async function AdminDashboard({ ctx }: { ctx: AuthedContext }) {
  const [d, att, board, approvals, toPublish, grants, sub] = await Promise.all([
    schoolOverview(ctx),
    ctx.can('attendance.oversee') ? attendanceOverview(ctx) : Promise.resolve(null),
    ctx.can('teacher_attendance.oversee') ? teacherBoard(ctx) : Promise.resolve(null),
    pendingApprovals(ctx),
    unpublishedCount(ctx),
    ctx.can('settings.manage') ? listSupportGrants(ctx) : Promise.resolve([]),
    ctx.tenantId ? tenantSubscription(ctx.tenantId) : Promise.resolve(null),
  ]);
  const fin = ctx.can('finance.read') ? await financeOverview(ctx) : null;
  const done = d.checklist.filter((c) => c.done).length;
  const setupComplete = done === d.checklist.length;
  const checkedIn = board ? board.summary.present + board.summary.late : 0;
  const supportPending = grants.some((g) => g.status === 'PENDING');
  const todos: Todo[] = [
    ...(supportPending
      ? [{ href: '/staff/settings#support', count: 1, tone: 'violet' as Tone, text: 'EDUsaas support asks for access' }]
      : []),
    ...(approvals > 0
      ? [
          {
            href: '/staff/leave?tab=approve',
            count: approvals,
            tone: 'amber' as Tone,
            text: `leave request${approvals === 1 ? '' : 's'} to decide`,
          },
        ]
      : []),
    ...(toPublish > 0
      ? [
          {
            href: '/staff/assessments?tab=publish',
            count: toPublish,
            tone: 'sky' as Tone,
            text: `test${toPublish === 1 ? '' : 's'} ready to publish`,
          },
        ]
      : []),
    ...(att && att.pending.length > 0
      ? [
          {
            href: '/staff/attendance',
            count: att.pending.length,
            tone: 'pink' as Tone,
            text: `register${att.pending.length === 1 ? '' : 's'} not taken today`,
          },
        ]
      : []),
    ...(d.counts.unplaced > 0
      ? [
          {
            href: '/staff/students',
            count: d.counts.unplaced,
            tone: 'mint' as Tone,
            text: `student${d.counts.unplaced === 1 ? '' : 's'} without a section`,
          },
        ]
      : []),
  ];

  const setup = (
    <Panel
      title="Set up your school"
      action={<span className="text-sm text-slate-500">{`${done} of ${d.checklist.length} done`}</span>}
    >
      {done === 0 && (
        <p className="mb-3 text-sm text-slate-600">
          Welcome! Follow these steps in order. Each one takes a few minutes, and you can come back any time.
        </p>
      )}
      <Meter value={done} max={d.checklist.length} label="Setup progress" />
      <ol className="mt-3 grid gap-x-6 sm:grid-cols-2">
        {d.checklist.map((c, i) => (
          <li key={c.key}>
            <Link href={c.href} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm hover:bg-slate-50">
              {c.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="Done" />
              ) : (
                <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-slate-500 ring-1 ring-slate-300">
                  {i + 1}
                </span>
              )}
              <span className={c.done ? 'text-slate-400 line-through' : 'font-medium'}>{c.label}</span>
              {!c.done && <ArrowRight className="ml-auto size-4 shrink-0 text-slate-400" />}
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Greeting
          title={greeting(ctx.user.displayName)}
          subtitle={`School Admin · ${ctx.session.tenant?.name}${d.year ? ` · ${d.year.name}` : ''}`}
          actions={
            <>
              <ButtonLink href="/staff/students?new=1">
                <UserPlus className="size-4" /> Admit student
              </ButtonLink>
              <ButtonLink href="/staff/teachers?new=1" variant="secondary">
                Add teacher
              </ButtonLink>
            </>
          }
        />

        {/* A new school sees its setup steps first; the daily numbers only mean something once classes exist.
            When only a step or two is left, a slim reminder is enough. */}
        {!setupComplete &&
          (d.checklist.length - done <= 2 && d.counts.students > 0 ? (
            <div className="space-y-2">
              {d.checklist
                .filter((c) => !c.done)
                .map((c) => (
                  <Link
                    key={c.key}
                    href={c.href}
                    className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
                    <span>
                      <span className="text-slate-500">Last setup step: </span>
                      <span className="font-medium">{c.label}</span>
                    </span>
                    <ArrowRight className="ml-auto size-4 shrink-0 text-slate-400" aria-hidden />
                  </Link>
                ))}
            </div>
          ) : (
            setup
          ))}

        {att && (
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <PastelStat
              tone="violet"
              title="Attendance today"
              ring={att.todayPct}
              caption={
                att.sectionsSubmitted
                  ? `${att.todayCounts.ABSENT} absent · ${att.todayCounts.LATE} late`
                  : 'No registers yet'
              }
              href="/staff/reports"
            />
            <PastelStat
              tone="pink"
              title="Registers taken"
              ring={pct(att.sectionsSubmitted, att.sectionsTotal)}
              value={`${att.sectionsSubmitted} of ${att.sectionsTotal} sections`}
              href="/staff/attendance"
            />
            <PastelStat
              tone="sky"
              title="Teachers in"
              ring={board ? pct(checkedIn, board.summary.total) : null}
              value={board ? `${checkedIn} of ${board.summary.total} · ${board.summary.late} late` : undefined}
              href="/staff/teacher-attendance"
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
        )}

        <NeedsYou items={todos} className="xl:hidden" />

        {board && board.summary.total > 0 && <TeachersNotIn board={board} />}

        <LatestAnnouncements ctx={ctx} href="/staff/announcements" />

        {(d.sectionsWithoutIncharge.length > 0 || d.sectionsWithoutTeachers.length > 0 || d.nearlyFull.length > 0) &&
          setupComplete && (
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

      <aside className="space-y-6">
        <NeedsYou items={todos} className="hidden xl:block" />
        {att && <RegistersPending pending={att.pending} />}
        {fin && <FinanceCard fin={fin} />}
        {sub && <PlanPanel sub={sub} />}
        {d.activity && <ActivityPanel activity={d.activity} />}
      </aside>
    </div>
  );
}

function FinanceCard({ fin }: { fin: Awaited<ReturnType<typeof financeOverview>> }) {
  return (
    <Panel title="Money this month" action={<PanelLink href="/staff/finance">Finance</PanelLink>}>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Collected</dt>
          <dd className="font-medium tabular-nums">{formatPKR(fin.monthCollectedPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Still owed</dt>
          <dd className="font-medium text-rose-700 tabular-nums">{formatPKR(fin.outstandingPaisa)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Spent</dt>
          <dd className="font-medium tabular-nums">{formatPKR(fin.monthExpensesPaisa)}</dd>
        </div>
      </dl>
      {fin.claimsPending > 0 && (
        <Link href="/staff/finance/claims" className="mt-3 block text-sm font-medium text-[var(--accent)]">
          {plural(fin.claimsPending, 'payment proof')} to check →
        </Link>
      )}
    </Panel>
  );
}

async function AccountantDashboard({ ctx }: { ctx: AuthedContext }) {
  const o = await financeOverview(ctx);
  return (
    <div className="space-y-6">
      <Greeting title={greeting(ctx.user.displayName)} subtitle={`Accountant · ${ctx.session.tenant?.name}`} />
      <FinanceOverview o={JSON.parse(JSON.stringify(o))} can={{ collect: true, reports: true }} />
    </div>
  );
}

function PlanPanel({ sub }: { sub: Awaited<ReturnType<typeof tenantSubscription>> }) {
  const s = sub.subscription;
  if (!s) return null;
  const tone =
    s.status === 'ACTIVE' ? 'green' : s.status === 'TRIAL' ? 'blue' : s.status === 'PAST_DUE' ? 'amber' : 'red';
  const label = { ACTIVE: 'Active', TRIAL: 'Trial', PAST_DUE: 'Payment due', CANCELLED: 'Cancelled' }[s.status];
  const row = (name: string, used: number, max: number | null) => (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-600">{name}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString()}
          {max ? ` / ${max.toLocaleString()}` : ''}
        </span>
      </div>
      {max ? (
        <Meter value={used} max={max} label={`${name} used`} />
      ) : (
        <p className="text-xs text-slate-500">No limit</p>
      )}
    </div>
  );
  return (
    <Panel title="Your plan" action={<Badge tone={tone}>{label}</Badge>}>
      <p className="mb-3 text-sm font-medium">
        {s.plan.name}
        {s.renewsOn && (
          <span className="font-normal text-slate-500">
            {' '}
            · renews{' '}
            {dayLabel(s.renewsOn.toISOString().slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </p>
      <div className="space-y-3">
        {row('Active students', sub.usage.students, s.plan.maxStudents)}
        {row('Staff accounts', sub.usage.staff, s.plan.maxStaff)}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Need more room?{' '}
        <Link href="/staff/support" className="font-medium text-[var(--accent)]">
          Ask EDUsaas
        </Link>
        .
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Principal: how the school is doing. Attendance, results, students at risk, and decisions waiting.
 * ------------------------------------------------------------------------------------------------------------- */
async function PrincipalDashboard({ ctx }: { ctx: AuthedContext }) {
  const [att, board, approvals, toPublish, subjects, year] = await Promise.all([
    ctx.can('attendance.oversee') ? attendanceOverview(ctx) : Promise.resolve(null),
    ctx.can('teacher_attendance.oversee') ? teacherBoard(ctx) : Promise.resolve(null),
    pendingApprovals(ctx),
    ctx.can('marks.manage') ? unpublishedCount(ctx) : Promise.resolve(0),
    ctx.can('reports.read') ? subjectAverages(ctx) : Promise.resolve([]),
    inTenant(ctx, (tx) => tx.academicYear.findFirst({ where: { status: 'CURRENT' }, select: { name: true } })),
  ]);
  const checkedIn = board ? board.summary.present + board.summary.late : 0;
  const todos: Todo[] = [
    ...(approvals > 0
      ? [
          {
            href: '/staff/leave?tab=approve',
            count: approvals,
            tone: 'amber' as Tone,
            text: `leave request${approvals === 1 ? '' : 's'} to decide`,
          },
        ]
      : []),
    ...(toPublish > 0
      ? [
          {
            href: '/staff/assessments?tab=publish',
            count: toPublish,
            tone: 'sky' as Tone,
            text: `test${toPublish === 1 ? '' : 's'} waiting to publish`,
          },
        ]
      : []),
    ...(att && att.pending.length > 0
      ? [
          {
            href: '/staff/attendance',
            count: att.pending.length,
            tone: 'pink' as Tone,
            text: `register${att.pending.length === 1 ? '' : 's'} not taken today`,
          },
        ]
      : []),
  ];
  const { points, yMin } = trendPoints(att?.trend ?? []);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Greeting
          title={greeting(ctx.user.displayName)}
          subtitle={`Principal · ${ctx.session.tenant?.name}${year ? ` · ${year.name}` : ''}`}
          actions={
            ctx.can('announcements.manage') ? (
              <ButtonLink href="/staff/announcements" variant="secondary">
                <Megaphone className="size-4" /> Announce
              </ButtonLink>
            ) : undefined
          }
        />

        {!att ? (
          <Panel>
            <EmptyState
              icon={<Layers className="size-5" />}
              title="The school year hasn’t started here yet"
              description="Once the School Admin sets up the current year and classes, attendance and results show here."
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <PastelStat
                tone="violet"
                title="Attendance today"
                ring={att.todayPct}
                caption={
                  att.sectionsSubmitted
                    ? `${att.todayCounts.ABSENT} absent · ${att.todayCounts.LATE} late`
                    : 'No registers yet'
                }
                href="/staff/reports"
              />
              <PastelStat
                tone="pink"
                title="Registers taken"
                ring={pct(att.sectionsSubmitted, att.sectionsTotal)}
                value={`${att.sectionsSubmitted} of ${att.sectionsTotal} sections`}
                href="/staff/attendance"
              />
              <PastelStat
                tone="sky"
                title="Teachers in"
                ring={board ? pct(checkedIn, board.summary.total) : null}
                value={board ? `${checkedIn} of ${board.summary.total} · ${board.summary.late} late` : undefined}
                href="/staff/teacher-attendance"
              />
              <PastelStat
                tone="amber"
                title="At risk"
                icon={<AlertTriangle className="size-6" />}
                value={plural(att.atRiskCount, 'student')}
                caption={`Below ${att.threshold}% attendance`}
                href="/staff/reports?tab=at-risk"
              />
            </div>

            <NeedsYou items={todos} className="xl:hidden" />

            <Panel
              title="Attendance, last 30 school days"
              action={<PanelLink href="/staff/reports">Full report</PanelLink>}
            >
              <AreaTrend
                points={points}
                target={att.threshold}
                yMin={yMin}
                caption="School-wide attendance percentage per school day"
              />
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Today by class">
                {att.todayByClass.length ? (
                  <BarList
                    caption="Attendance today per class (registers taken so far)"
                    unit="%"
                    max={100}
                    rows={att.todayByClass.map((c) => ({
                      label: c.name,
                      value: c.pct ?? 0,
                      hint: `${c.absent} absent`,
                    }))}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">No registers taken yet today.</p>
                )}
              </Panel>
              <Panel
                title="Results by subject"
                action={<PanelLink href="/staff/reports?tab=marks">Marks report</PanelLink>}
              >
                {subjects.length ? (
                  <BarList
                    caption="Average score on published tests this year"
                    unit="%"
                    max={100}
                    rows={subjects.map((s) => ({ label: s.subject, value: s.avg, hint: plural(s.tests, 'test') }))}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Averages show here once tests are published.
                  </p>
                )}
              </Panel>
            </div>
          </>
        )}

        <LatestAnnouncements ctx={ctx} href="/staff/announcements" />
      </div>

      <aside className="space-y-6">
        <NeedsYou items={todos} className="hidden xl:block" />
        {att && <AtRiskPanel att={att} canReports={ctx.can('reports.read')} />}
        {board && board.summary.total > 0 && <TeachersNotIn board={board} />}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------------------------
 * Admissions Officer: the admissions desk. Seats per section, this month's admissions, quick admit and import.
 * ------------------------------------------------------------------------------------------------------------- */
async function AdmissionsDashboard({ ctx }: { ctx: AuthedContext }) {
  const [a, d, sub] = await Promise.all([
    admissionsOverview(ctx),
    schoolOverview(ctx),
    ctx.tenantId ? tenantSubscription(ctx.tenantId) : Promise.resolve(null),
  ]);
  const limit = sub?.subscription?.plan.maxStudents ?? null;
  const roomOnPlan = limit === null ? null : Math.max(0, limit - (sub?.usage.students ?? 0));
  const openSeats = a.seats.filter((s) => s.left === null || s.left > 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <Greeting
          title={greeting(ctx.user.displayName)}
          subtitle={`Admissions · ${ctx.session.tenant?.name}${a.year ? ` · ${a.year.name}` : ''}`}
          actions={
            <>
              {ctx.can('students.write') && (
                <ButtonLink href="/staff/students?new=1">
                  <UserPlus className="size-4" /> Admit student
                </ButtonLink>
              )}
              {ctx.can('students.import') && (
                <ButtonLink href="/staff/students/import" variant="secondary">
                  <Upload className="size-4" /> Import from Excel
                </ButtonLink>
              )}
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <PastelStat
            tone="mint"
            title="Students"
            icon={<GraduationCap className="size-6" />}
            value={d.counts.students.toLocaleString()}
            caption={limit ? `Plan allows ${limit.toLocaleString()}` : 'Active students'}
            href="/staff/students"
          />
          <PastelStat
            tone="violet"
            title={`Admitted in ${a.month}`}
            icon={<UserPlus className="size-6" />}
            value={a.admitted}
            caption={a.withdrawn ? `${a.withdrawn} withdrawn` : 'No withdrawals'}
          />
          <PastelStat
            tone="sky"
            title="Seats left"
            icon={<Armchair className="size-6" />}
            value={a.seatsLeft === null ? 'No limits set' : a.seatsLeft.toLocaleString()}
            caption={a.full ? `${plural(a.full, 'section')} full` : 'Across all sections'}
          />
          <PastelStat
            tone={roomOnPlan !== null && roomOnPlan < 20 ? 'amber' : 'pink'}
            title="Room on plan"
            icon={<Layers className="size-6" />}
            value={roomOnPlan === null ? 'Unlimited' : `${roomOnPlan.toLocaleString()} more`}
            caption={sub?.subscription ? sub.subscription.plan.name : 'No plan limit'}
          />
        </div>

        {a.unplaced > 0 && (
          <Link
            href="/staff/students"
            className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>
              <strong>{plural(a.unplaced, 'student')}</strong> admitted without a section. Place them so they appear in
              registers.
            </span>
            <ArrowRight className="ml-auto size-4 shrink-0" aria-hidden />
          </Link>
        )}

        <Panel
          title="Seats by section"
          action={
            <span className="text-sm text-slate-500">
              {openSeats.length} of {a.seats.length} open
            </span>
          }
        >
          {a.seats.length ? (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {a.seats.map((s) => (
                <li key={s.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">{s.label}</span>
                    <span
                      className={cx(
                        'tabular-nums',
                        s.left === 0
                          ? 'font-semibold text-rose-700'
                          : s.left !== null && s.left <= 3
                            ? 'text-amber-700'
                            : 'text-slate-500',
                      )}
                    >
                      {s.capacity === null
                        ? `${s.students} students`
                        : s.left === 0
                          ? `Full (${s.students}/${s.capacity})`
                          : `${s.left} left · ${s.students}/${s.capacity}`}
                    </span>
                  </div>
                  {s.capacity !== null && <Meter value={s.students} max={s.capacity} label={`${s.label} seats used`} />}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Layers className="size-5" />}
              title="No classes yet"
              description="The School Admin creates classes and sections first. Then you can admit students into them."
            />
          )}
        </Panel>

        <LatestAnnouncements ctx={ctx} href="/staff/announcements" />
      </div>

      <aside className="space-y-6">
        <RecentAdmissions rows={d.recentAdmissions} />
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
