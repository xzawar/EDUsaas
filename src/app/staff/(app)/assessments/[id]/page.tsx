import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { MarksSheet } from '@/components/marks/MarksSheet';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { getAssessment } from '@/server/school/assessments';

export const metadata: Metadata = { title: 'Marks' };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePortal('STAFF');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const a = await getAssessment(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/assessments" className="hover:text-slate-800">
            ← Tests & marks
          </Link>
        }
        title={a.name}
        description={`${a.section} · ${a.subject} · ${new Date(`${a.heldOn}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })} · out of ${a.maxMarks}`}
      />
      <MarksSheet sheet={JSON.parse(JSON.stringify(a))} />
    </>
  );
}
