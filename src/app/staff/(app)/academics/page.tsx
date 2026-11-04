import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { AcademicsManager } from '@/components/academics/AcademicsManager';
import { requirePortal } from '@/server/auth/page';
import { listTeachers } from '@/server/school/people';
import { getStructure, listSubjects, listYears } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Classes & sections' };

export default async function AcademicsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const ctx = await requirePortal('STAFF', 'structure.manage');
  const sp = await searchParams;
  const years = await listYears(ctx);
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.status === 'CURRENT') ?? years[0] ?? null;
  const [structure, subjects, teachers] = await Promise.all([
    year ? getStructure(ctx, year.id) : Promise.resolve(null),
    listSubjects(ctx),
    listTeachers(ctx, { limit: 100 }),
  ]);
  return (
    <>
      <PageHeader
        title="Classes & sections"
        description="Academic year → class → section. Choose a Class Incharge for each section."
      />
      <AcademicsManager
        years={years}
        year={year}
        classes={structure?.classes ?? []}
        subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
        teachers={teachers.items.filter((t) => t.status === 'ACTIVE').map((t) => ({ id: t.id, name: t.name }))}
      />
    </>
  );
}
