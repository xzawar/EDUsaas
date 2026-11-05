import { ArrowRight, BookOpen, CheckCircle2, Circle, GraduationCap, Layers, UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { BarList, Meter } from '@/components/charts';
import { Badge, ButtonLink, Card, EmptyState, ROLE_LABELS, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import type { AuthedContext } from '@/server/http/route';
import { schoolOverview, teacherOverview } from '@/server/school/dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'student.create': 'Student admitted',
  'student.update': 'Student updated',
  'student.update_guardian': 'Guardian details changed',
  'student.transfer': 'Student transferred',
  'student.withdraw': 'Student withdrawn',
  'student.restore': 'Student restored',
  'teacher.create': 'Teacher added',
  'teacher.assignments': 'Teacher assignments changed',
  'staff.create': 'Staff account created',
  'user.reset_password': 'Password reset',
  'section.incharge': 'Class Incharge changed',
  'section.renumber': 'Roll numbers renumbered',
  'promotion.run': 'Promotion run',
  'permissions.update': 'Permission changed',
  'settings.update': 'Settings changed',
  'year.create': 'Academic year created',
  'class.create': 'Class created',
  'access.denied': 'Access denied',
  'access.not_found': 'Blocked lookup',
};

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
  const d = await schoolOverview(ctx);
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
          hint={d.counts.unplaced ? `${d.counts.unplaced} not placed in a section` : 'All placed in sections'}
        />
        <Stat label="Teachers" value={d.counts.teachers} hint={`${d.counts.subjects} subjects`} />
        <Stat label="Classes" value={d.counts.classes} hint={`${d.counts.sections} sections`} />
        <Stat
          label="Students per teacher"
          value={d.counts.teachers ? (d.counts.students / d.counts.teachers).toFixed(1) : '—'}
          hint={`${d.genders.FEMALE ?? 0} girls · ${d.genders.MALE ?? 0} boys`}
        />
      </div>

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
                      {ACTION_LABELS[a.action] ?? a.action}
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
  const d = await teacherOverview(ctx);
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Karachi',
  }).format(new Date());
  return (
    <>
      <PageHeader title={greeting(ctx.user.displayName)} description={`${today} · ${ctx.session.tenant?.name}`} />
      {!d || d.sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="No classes assigned yet"
            description="Your School Admin will assign you to sections and subjects. They'll appear here."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <Stat label="Sections" value={d.sections.length} />
            <Stat label="Subjects" value={d.subjectCount} />
            <Stat label="Students" value={d.totalStudents} />
          </div>

          {d.incharge.map((s) => (
            <div key={s.id} className="mt-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
              <p className="text-xs font-semibold tracking-wider text-[var(--accent)] uppercase">Class Incharge</p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold">{s.label}</p>
                  <p className="text-sm text-slate-600">{s.students} students</p>
                </div>
                <ButtonLink href={`/staff/students?sectionId=${s.id}`} variant="secondary">
                  <Users className="size-4" /> Class list
                </ButtonLink>
              </div>
            </div>
          ))}

          <h2 className="mt-8 mb-3 text-base font-semibold">My classes</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {d.sections.map((s) => (
              <Link
                key={s.id}
                href={`/staff/students?sectionId=${s.id}`}
                className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <p className="text-lg font-semibold">{s.label}</p>
                  {s.isIncharge && <Badge tone="green">Incharge</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {s.subjects.length ? s.subjects.join(' · ') : 'Class Incharge only'}
                </p>
                <p className="mt-3 flex items-center justify-between text-sm text-slate-500">
                  {s.students} students{' '}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                </p>
              </Link>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Attendance, marks and your timetable arrive with the next release.
          </p>
        </>
      )}
    </>
  );
}
