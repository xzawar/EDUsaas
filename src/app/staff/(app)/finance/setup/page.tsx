import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { FeeHeadsEditor, FeeStructureGrid, LateFeeEditor } from '@/components/finance/FeeSetup';
import { Card, EmptyState, ButtonLink, Select } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { feeStructure, lateFeeRule, listFeeHeads } from '@/server/school/finance/setup';
import { currentYear, listYears } from '@/server/school/structure';
import { Layers } from 'lucide-react';

export const metadata: Metadata = { title: 'Fee setup' };

export default async function FeeSetupPage({ searchParams }: { searchParams: Promise<{ yearId?: string }> }) {
  const ctx = await requirePortal('STAFF', 'fees.manage');
  const { yearId } = await searchParams;
  const [years, current, heads] = await Promise.all([listYears(ctx), currentYear(ctx), listFeeHeads(ctx, true)]);
  const year = years.find((y) => y.id === yearId) ?? (current ? years.find((y) => y.id === current.id) : years[0]);
  const [structure, rule] = year
    ? await Promise.all([feeStructure(ctx, year.id), lateFeeRule(ctx, year.id)])
    : [null, null];
  return (
    <>
      <PageHeader
        title="Fee setup"
        description="What each class pays, every month. Change it here; bills already issued don’t change."
      />
      <div className="space-y-6">
        <Card title="Fee heads" description="The lines on a bill. Archive one to stop charging it from next month.">
          <FeeHeadsEditor heads={JSON.parse(JSON.stringify(heads))} />
        </Card>
        {!year ? (
          <Card>
            <EmptyState
              icon={<Layers className="size-5" />}
              title="Create an academic year first"
              description="Fee amounts belong to a year and its classes."
              action={
                ctx.can('structure.manage') ? (
                  <ButtonLink href="/staff/academics">Classes & sections</ButtonLink>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <>
            <Card
              title={`Amounts per class · ${year.name}`}
              description="In rupees per month. Leave a box empty if that class doesn’t pay that head."
              actions={
                years.length > 1 ? (
                  <form action="/staff/finance/setup" className="flex items-center gap-2 text-sm">
                    <Select name="yearId" defaultValue={year.id} className="h-9">
                      {years.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="submit"
                      className="h-9 rounded-lg px-3 text-sm ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Show
                    </button>
                  </form>
                ) : undefined
              }
            >
              <FeeStructureGrid structure={structure!} years={years.map((y) => ({ id: y.id, name: y.name }))} />
            </Card>
            <Card
              title={`Late fee · ${year.name}`}
              description="Added to a bill once it’s past the due date and grace period. You can waive it per bill."
            >
              <LateFeeEditor yearId={year.id} rule={rule} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
