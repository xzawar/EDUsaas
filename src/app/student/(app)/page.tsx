import { BookOpen, User } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Card, EmptyState, KeyValue, Stat } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { studentOverview } from '@/server/school/dashboard';

export const metadata: Metadata = { title: 'Home' };

export default async function StudentHome() {
  const ctx = await requirePortal('STUDENT');
  const d = await studentOverview(ctx);
  return (
    <>
      <PageHeader
        title={`Hello, ${ctx.user.displayName.split(' ')[0]}`}
        description={`${ctx.session.tenant?.name}${d?.year ? ` · ${d.year}` : ''}`}
      />
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat label="Class" value={d?.section ?? '—'} />
        <Stat label="Roll no." value={d?.rollNumber ?? '—'} />
        <Stat label="Subjects" value={d?.subjects.length ?? 0} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="My subjects">
          {d?.subjects.length ? (
            <ul className="divide-y divide-slate-100">
              {d.subjects.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <BookOpen className="size-4 text-[var(--accent)]" aria-hidden /> {s.name}
                  </span>
                  <span className="text-slate-500">{s.teacher ?? 'Teacher not assigned'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<BookOpen className="size-5" />}
              title="No subjects yet"
              description="Your school hasn’t set up your class subjects yet."
            />
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
              ['Admission no.', d?.admissionNo ?? null],
              ['Classmates', d ? String(d.classmates) : null],
            ]}
          />
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
            <User className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Your username changes when you move to a new class. If you can’t sign in, ask your school office for your
            current username.
          </p>
        </Card>
      </div>
      <p className="mt-6 text-sm text-slate-500">
        Attendance, marks and your timetable will appear here as your school starts recording them.
      </p>
    </>
  );
}
