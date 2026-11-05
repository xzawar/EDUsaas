import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { AccountActions, AssignmentsEditor, EditTeacherButton } from '@/components/people/TeacherForms';
import { PhotoEditor } from '@/components/people/PhotoEditor';
import { Badge, Card, KeyValue, formatPhone } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { getTeacher } from '@/server/school/people';
import { currentYear, getStructure } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Teacher' };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('STAFF', 'teachers.read');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const teacher = await getTeacher(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const canWrite = ctx.can('teachers.write');
  const year = await currentYear(ctx);
  const structure = year && canWrite ? await getStructure(ctx, year.id) : null;
  const sectionOptions =
    structure?.classes.flatMap((c) =>
      c.sections.map((s) => ({ id: s.id, label: `${c.name}-${s.name}`, className: c.name, subjects: c.subjects })),
    ) ?? [];
  const fmt = (d: Date | string | null) =>
    d
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
      : null;

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/teachers" className="hover:text-slate-800">
            ← Teachers
          </Link>
        }
        title={teacher.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{teacher.username}</span>
            {teacher.status !== 'ACTIVE' && <Badge tone="red">Login disabled</Badge>}
            {teacher.pendingFirstLogin && <Badge tone="amber">Hasn’t signed in yet</Badge>}
          </span>
        }
        actions={
          canWrite ? (
            <>
              <EditTeacherButton
                id={teacher.id}
                initial={{
                  displayName: teacher.name,
                  employeeNo: teacher.employeeNo ?? '',
                  phone: formatPhone(teacher.phone) ?? '',
                  qualification: teacher.qualification ?? '',
                  joinedOn: teacher.joinedOn ?? '',
                }}
              />
              {ctx.can('users.manage') && (
                <AccountActions
                  userId={teacher.userId}
                  name={teacher.name}
                  status={teacher.status}
                  schoolName={ctx.session.tenant?.name ?? ''}
                />
              )}
            </>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col items-center py-2 text-center">
              <PhotoEditor
                name={teacher.name}
                src={teacher.photoVersion ? `/api/v1/teachers/${teacher.id}/photo?v=${teacher.photoVersion}` : null}
                endpoint={`/teachers/${teacher.id}/photo`}
                canEdit={ctx.can('teachers.write')}
              />
              <p className="mt-3 text-lg font-semibold">{teacher.name}</p>
              <p className="text-sm text-slate-600">{teacher.qualification ?? 'Teacher'}</p>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <KeyValue
                items={[
                  ['Employee no.', teacher.employeeNo],
                  ['Phone', formatPhone(teacher.phone)],
                  ['Joined', fmt(teacher.joinedOn)],
                  ['Last sign-in', fmt(teacher.lastLoginAt) ?? 'Never'],
                ]}
              />
            </div>
          </Card>
          <Card title="Class Incharge" description="Set on the Classes & sections page.">
            {teacher.inchargeOf.length ? (
              <ul className="space-y-2 text-sm">
                {teacher.inchargeOf.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <Link
                      href={`/staff/students?sectionId=${s.id}`}
                      className="font-medium text-[var(--accent)] hover:underline"
                    >
                      {s.label}
                    </Link>
                    <span className="text-slate-500">{s.studentCount} students</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Not a Class Incharge this year.</p>
            )}
          </Card>
        </div>
        <Card
          className="lg:col-span-2"
          title="Teaching assignments"
          description={year ? `${year.name}: tap a subject to assign or remove it.` : 'No current academic year'}
        >
          {canWrite && year ? (
            <AssignmentsEditor
              teacherId={teacher.id}
              yearId={year.id}
              sections={sectionOptions}
              initial={teacher.assignments.map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId }))}
            />
          ) : teacher.assignments.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {teacher.assignments.map((a) => (
                <li key={`${a.sectionId}${a.subjectId}`} className="flex justify-between py-2">
                  <span>{a.subject}</span>
                  <Badge>{a.section}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No assignments.</p>
          )}
        </Card>
      </div>
    </>
  );
}
