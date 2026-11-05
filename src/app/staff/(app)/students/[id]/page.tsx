import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { StudentActions } from '@/components/people/StudentActions';
import { EditStudentButton } from '@/components/people/StudentForm';
import { AddRemarkButton } from '@/components/marks/AddRemark';
import { AttendanceRing } from '@/components/student/AttendanceRing';
import { studentAttendance } from '@/server/school/attendance';
import { studentRemarks, studentResults } from '@/server/school/assessments';
import { Alert, Avatar, Badge, Card, KeyValue, formatPhone } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { getStudent } from '@/server/school/people';
import { listSections } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Student' };

const fmt = (d: string | Date | null) =>
  d
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        typeof d === 'string' ? new Date(d) : d,
      )
    : null;

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('STAFF', 'students.search');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const student = await getStudent(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const sections = ctx.can('students.write') ? await listSections(ctx) : [];
  const [att, results, remarks] = await Promise.all([
    studentAttendance(ctx, student.id),
    studentResults(ctx, student.id),
    studentRemarks(ctx, student.id, false),
  ]);
  const statusTone = student.status === 'ACTIVE' ? 'green' : student.status === 'GRADUATED' ? 'blue' : 'red';

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/students" className="hover:text-slate-800">
            ← Students
          </Link>
        }
        title={student.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{student.username}</span>
            <Badge tone={statusTone}>{student.status.charAt(0) + student.status.slice(1).toLowerCase()}</Badge>
            {student.pendingFirstLogin && <Badge tone="amber">Hasn’t signed in yet</Badge>}
          </span>
        }
        actions={
          <>
            {ctx.can('students.write') && (
              <EditStudentButton
                id={student.id}
                guardianEditable={ctx.user.role === 'SCHOOL_ADMIN'}
                initial={{
                  displayName: student.name,
                  sectionId: student.section?.id ?? '',
                  admissionNo: student.admissionNo ?? '',
                  gender: student.gender ?? '',
                  dateOfBirth: student.dateOfBirth ?? '',
                  admittedOn: student.admittedOn ?? '',
                  guardianName: student.guardianName ?? '',
                  guardianPhone: formatPhone(student.guardianPhone) ?? '',
                  address: student.address ?? '',
                }}
              />
            )}
            <StudentActions
              student={{
                id: student.id,
                name: student.name,
                status: student.status,
                canRestore: student.canRestore,
                sectionId: student.section?.id ?? null,
                sectionLabel: student.section?.label ?? null,
              }}
              sections={sections}
              can={{ write: ctx.can('students.write'), reset: ctx.can('students.reset_password') }}
              schoolName={ctx.session.tenant?.name ?? ''}
            />
          </>
        }
      />

      {student.status === 'WITHDRAWN' && (
        <div className="mb-6">
          <Alert tone="warning">
            Withdrawn on {fmt(student.withdrawnAt)}.{' '}
            {student.canRestore
              ? `Can be restored until ${fmt(student.restoreUntil)}.`
              : 'The 30-day restore window has passed.'}
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center py-2 text-center">
            <Avatar name={student.name} size="lg" />
            <p className="mt-3 text-lg font-semibold">{student.name}</p>
            <p className="text-sm text-slate-600">
              {student.section
                ? `${student.section.label} · Roll no. ${student.rollNumber}`
                : 'Not placed in a section'}
            </p>
            {student.section && <p className="mt-1 text-xs text-slate-500">{student.section.year}</p>}
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <KeyValue
              items={[
                ['Class Incharge', student.section?.classTeacher ?? 'Not assigned'],
                ['Last sign-in', fmt(student.lastLoginAt) ?? 'Never'],
              ]}
            />
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card title="Details">
            <KeyValue
              items={[
                ['Admission no.', student.admissionNo],
                ['Gender', student.gender ? student.gender.charAt(0) + student.gender.slice(1).toLowerCase() : null],
                ['Date of birth', fmt(student.dateOfBirth)],
                ['Admitted on', fmt(student.admittedOn)],
                ['Address', student.address],
              ]}
            />
          </Card>
          <Card title="Guardian" description="Reference only. Parents sign in with the student’s own account.">
            <KeyValue
              items={[
                ['Name', student.guardianName],
                [
                  'Phone',
                  student.guardianPhone ? (
                    <a
                      href={`tel:${student.guardianPhone.replace(/\s/g, '')}`}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {formatPhone(student.guardianPhone)}
                    </a>
                  ) : null,
                ],
              ]}
            />
          </Card>
          <Card title="Attendance" description="This academic year.">
            <div className="flex flex-wrap items-center gap-6">
              <AttendanceRing pct={att.pct} threshold={att.threshold} size={110} />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <dt className="text-slate-500">Present</dt>
                <dd className="font-medium tabular-nums">{att.counts.PRESENT}</dd>
                <dt className="text-slate-500">Late</dt>
                <dd className="font-medium tabular-nums">{att.counts.LATE}</dd>
                <dt className="text-slate-500">Absent</dt>
                <dd className="font-medium tabular-nums">{att.counts.ABSENT}</dd>
                <dt className="text-slate-500">Leave / excused</dt>
                <dd className="font-medium tabular-nums">{att.counts.LEAVE + att.counts.EXCUSED}</dd>
              </dl>
            </div>
          </Card>
          <Card title="Marks" description="Published results this year.">
            {results.subjects.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {results.subjects.map((x) => (
                  <li key={x.subject} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{x.subject}</span>
                    <span className="font-semibold">
                      {x.grade} <span className="font-normal text-slate-500 tabular-nums">{x.pct}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No published marks yet.</p>
            )}
          </Card>
          <Card
            title="Remarks"
            actions={
              ctx.can('remarks.write') || ctx.can('marks.manage') ? (
                <AddRemarkButton
                  studentId={student.id}
                  name={student.name}
                  autoApproved={ctx.user.role === 'SCHOOL_ADMIN'}
                />
              ) : undefined
            }
          >
            {remarks.length ? (
              <ul className="space-y-3">
                {remarks.map((m) => (
                  <li key={m.id} className="text-sm">
                    <p className="text-slate-800">“{m.text}”</p>
                    <p className="text-xs text-slate-500">
                      {m.author}
                      {m.subject ? ` · ${m.subject}` : ''} ·{' '}
                      {m.status === 'APPROVED'
                        ? 'visible to student'
                        : m.status === 'PENDING'
                          ? 'waiting for review'
                          : 'hidden'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No remarks yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
