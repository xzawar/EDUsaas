import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { DatePicker, Register } from '@/components/attendance/Register';
import { cx } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { attendanceSheet } from '@/server/school/attendance';

export const metadata: Metadata = { title: 'Take attendance' };

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  const ctx = await requirePortal('STAFF');
  const { sectionId } = await params;
  const { date, period } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const sheet = await attendanceSheet(
    ctx,
    sectionId,
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    period && /^\d{1,2}$/.test(period) ? Number(period) : undefined,
  ).catch((e) => {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    if (e instanceof AppError && e.code === 'VALIDATION_FAILED' && period)
      redirect(`/staff/attendance/${sectionId}${date ? `?date=${date}` : ''}`);
    throw e;
  });
  const label = new Date(`${sheet.date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
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
      {sheet.mode === 'PER_PERIOD' && (
        <nav aria-label="Periods" className="mb-4 flex flex-wrap gap-2">
          {sheet.periods.map((p) => (
            <Link
              key={p.period}
              href={`/staff/attendance/${sectionId}?date=${sheet.date}&period=${p.period}`}
              aria-current={p.period === sheet.period ? 'page' : undefined}
              className={cx(
                'rounded-xl px-3 py-1.5 text-sm font-medium ring-1 transition',
                p.period === sheet.period
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}
      <Register key={`${sheet.date}-${sheet.period}`} sheet={JSON.parse(JSON.stringify(sheet))} userId={ctx.user.id} />
    </>
  );
}
