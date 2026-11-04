import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { SubjectsManager } from '@/components/academics/SubjectsManager';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listSubjects } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Subjects' };

export default async function SubjectsPage() {
  const ctx = await requirePortal('STAFF', 'structure.manage');
  const subjects = await listSubjects(ctx, true);
  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects are shared across academic years. Choose which classes take each subject on the Classes & sections page."
      />
      <Card>
        <SubjectsManager subjects={subjects} />
      </Card>
    </>
  );
}
