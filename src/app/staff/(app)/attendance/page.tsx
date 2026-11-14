import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/AppShell';
import { Badge, ButtonLink, Card, EmptyState } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { attendanceSections } from '@/server/school/attendance';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendancePage() {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('attendance.submit') && !ctx.can('attendance.oversee')) redirect('/staff');
  const { today, sections } = await attendanceSections(ctx);
  const done = sections.filter((s) => s.done).length;
  const label = new Date(`${today}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  return (
    <>
      <PageHeader title="Attendance" description={`${label} · ${done} of ${sections.length} registers taken`} />
      {sections.length === 0 ? (
        <Card>
          <EmptyState
            title="No sections to mark"
            description={
              ctx.can('attendance.oversee')
                ? 'Registers appear here once the current year has classes and sections with students.'
                : 'Your sections appear here once the School Admin makes you a Class Incharge or assigns you to a class.'
            }
            action={
              ctx.can('structure.manage') ? <ButtonLink href="/staff/academics">Set up classes</ButtonLink> : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Link
              key={s.id}
              href={`/staff/attendance/${s.id}`}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-deep/30"
            >
              {s.done ? (
                <CheckCircle2 className="size-6 text-emerald-600" aria-label="Taken" />
              ) : (
                <Circle className="size-6 text-slate-300" aria-label="Not taken" />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {s.label} {s.isIncharge && <Badge tone="green">Incharge</Badge>}
                </span>
                <span className="block text-sm text-slate-500">
                  {s.done ? `${s.present} present · ${s.absent} absent` : `${s.students} students · not taken yet`}
                </span>
              </span>
              <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-deep-2" />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
