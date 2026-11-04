import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { PeriodsEditor, TimetableGrid } from '@/components/timetable/TimetableGrid';
import { SectionSwitcher } from '@/components/timetable/SectionSwitcher';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { inTenant, schoolClock, teacherScope, weekday } from '@/server/school/common';
import { listTeachers } from '@/server/school/people';
import { listSections } from '@/server/school/structure';
import { getPeriods, myTimetable, sectionTimetable } from '@/server/school/timetable';

export const metadata: Metadata = { title: 'Timetable' };

export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const ctx = await requirePortal('STAFF');
  if (!ctx.can('timetable.view') && !ctx.can('timetable.manage')) redirect('/staff');
  const { section } = await searchParams;
  const manage = ctx.can('timetable.manage');
  const clock = await inTenant(ctx, (tx) => schoolClock(tx));
  const today = weekday(clock.today);
  let sections = await listSections(ctx);
  if (ctx.user.role === 'TEACHER') {
    const scope = await inTenant(ctx, (tx) => teacherScope(tx, ctx.user.id));
    sections = sections.filter((s) => scope.sectionIds.includes(s.id));
  }
  const isTeacher = ctx.user.role === 'TEACHER';
  const sectionId = section && sections.some((s) => s.id === section) ? section : isTeacher ? null : (sections[0]?.id ?? null);

  const [tt, periods, teachers] = await Promise.all([
    sectionId ? sectionTimetable(ctx, sectionId) : null,
    getPeriods(ctx),
    manage ? listTeachers(ctx, { limit: 100 }) : Promise.resolve(null),
  ]);
  const mine = !sectionId && isTeacher ? await myTimetable(ctx) : null;

  return (
    <>
      <PageHeader
        title="Timetable"
        description={mine ? 'Your week. Pick a class to see its timetable.' : manage ? 'Click a period to set the subject and teacher. A teacher can’t be in two classes at once.' : 'Weekly timetable by class.'}
        actions={
          <>
            <SectionSwitcher sections={sections.map((s) => ({ id: s.id, label: s.label }))} value={sectionId} allowMine={isTeacher} />
            {manage && <PeriodsEditor days={periods.days} periods={periods.periods} />}
          </>
        }
      />
      <Card title={mine ? 'My timetable' : tt ? `Class ${tt.section.label}` : undefined}>
        {mine ? (
          <TimetableGrid grid={mine} today={today} />
        ) : tt ? (
          <TimetableGrid
            grid={tt}
            today={today}
            edit={manage ? { sectionId: tt.section.id, subjects: tt.subjects, allTeachers: (teachers?.items ?? []).filter((t) => t.status === 'ACTIVE').map((t) => ({ id: t.id, name: t.name })) } : undefined}
          />
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">No classes yet.</p>
        )}
      </Card>
    </>
  );
}
