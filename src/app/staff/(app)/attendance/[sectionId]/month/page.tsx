import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/AppShell';
import { MonthGrid } from '@/components/attendance/MonthGrid';
import { Card } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { AppError } from '@/server/http/errors';
import { sectionGrid } from '@/server/school/attendance';
import { inTenant, schoolClock } from '@/server/school/common';

export const metadata: Metadata = { title: 'Attendance month view' };

function shiftMonth(m: string, by: number) {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

export default async function MonthPage({
  params,
  searchParams,
}: {
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<{ month?: string; period?: string }>;
}) {
  const ctx = await requirePortal('STAFF');
  const { sectionId } = await params;
  const { month, period } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const grid = await sectionGrid(ctx, sectionId, month, period && /^\d{1,2}$/.test(period) ? Number(period) : 1).catch(
    (e) => {
      if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
      throw e;
    },
  );
  const clock = await inTenant(ctx, (tx) => schoolClock(tx));
  const title = new Date(`${grid.month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const nav = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50';
  return (
    <>
      <PageHeader
        breadcrumb={
          <Link href={`/staff/attendance/${sectionId}`} className="hover:text-slate-800">
            ← {grid.section.label} register
          </Link>
        }
        title={`${grid.section.label} · ${title}`}
        description={`Attendance % counts Present and Late; approved leave and excused days don’t count against. Below ${clock.atRiskThreshold}% is shown in red.`}
        actions={
          <div className="flex gap-2">
            <Link className={nav} href={`?month=${shiftMonth(grid.month, -1)}`}>
              ← Previous
            </Link>
            {grid.month < grid.today.slice(0, 7) && (
              <Link className={nav} href={`?month=${shiftMonth(grid.month, 1)}`}>
                Next →
              </Link>
            )}
          </div>
        }
      />
      <Card>
        <MonthGrid grid={grid} threshold={clock.atRiskThreshold} />
      </Card>
    </>
  );
}
