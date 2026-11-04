import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { DatePicker, Register } from '@/components/attendance/Register';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { attendanceSheet } from '@/server/school/attendance';

export const metadata: Metadata = { title: 'Take attendance' };

export default async function RegisterPage({ params, searchParams }: { params: Promise<{ sectionId: string }>; searchParams: Promise<{ date?: string }> }) {
  const ctx = await requirePortal('STAFF');
  const { sectionId } = await params;
  const { date } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const sheet = await attendanceSheet(ctx, sectionId, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  const label = new Date(`${sheet.date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href="/staff/attendance" className="hover:text-slate-800">
            ← Attendance
          </Link>
        }
        title={`${sheet.section.label} · ${label}`}
        description={`${sheet.students.length} students`}
        actions={<DatePicker sectionId={sectionId} date={sheet.date} today={sheet.today} />}
      />
      <Register key={sheet.date} sheet={JSON.parse(JSON.stringify(sheet))} userId={ctx.user.id} />
    </>
  );
}
