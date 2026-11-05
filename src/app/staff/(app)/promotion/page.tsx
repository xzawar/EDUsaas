import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { PromotionWizard } from '@/components/academics/PromotionWizard';
import { YearArchiveCard } from '@/components/academics/YearArchiveCard';
import { storage } from '@/server/files/storage';
import { yearArchiveJobs } from '@/server/school/archives';
import { Badge, Card, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { listPromotionJobs, promotionCandidates } from '@/server/school/promotion';
import { listSections, listYears } from '@/server/school/structure';

export const metadata: Metadata = { title: 'Promotion' };

export default async function PromotionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const ctx = await requirePortal('STAFF', 'promotion.run');
  const sp = await searchParams;
  const years = await listYears(ctx);
  const from = years.find((y) => y.id === sp.from) ?? years.find((y) => y.status === 'CURRENT') ?? null;
  const to =
    years.find((y) => y.id === sp.to && y.id !== from?.id) ??
    years.find((y) => y.status === 'PLANNED' && y.id !== from?.id) ??
    null;
  const [candidates, targets, jobs, archives] = await Promise.all([
    from && to ? promotionCandidates(ctx, from.id) : Promise.resolve([]),
    to ? listSections(ctx, to.id) : Promise.resolve([]),
    listPromotionJobs(ctx),
    yearArchiveJobs(ctx),
  ]);
  return (
    <>
      <PageHeader
        title="Promotion"
        description="Move students into next year’s classes. Roll numbers carry over; usernames update automatically."
      />
      <PromotionWizard
        key={`${from?.id}-${to?.id}`}
        years={years}
        fromYearId={from?.id ?? null}
        toYearId={to?.id ?? null}
        candidates={candidates}
        targets={targets.map((t) => ({
          id: t.id,
          label: t.label,
          name: t.name,
          gradeLevel: t.gradeLevel,
          studentCount: t.studentCount,
          capacity: t.capacity,
        }))}
      />
      <YearArchiveCard jobs={archives} storageReady={!!storage()} />
      {jobs.length > 0 && (
        <Card className="mt-6" title="Previous promotions">
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Years</Th>
                <Th className="text-right">Promoted</Th>
                <Th className="text-right">Held back</Th>
                <Th className="text-right">Graduated</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const r = (j.result ?? {}) as {
                  fromYear?: string;
                  toYear?: string;
                  promote?: number;
                  repeat?: number;
                  graduate?: number;
                };
                return (
                  <tr key={j.id}>
                    <Td>
                      {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
                        j.createdAt,
                      )}
                    </Td>
                    <Td>
                      {r.fromYear} → {r.toYear}
                    </Td>
                    <Td className="text-right tabular-nums">{r.promote ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{r.repeat ?? '—'}</Td>
                    <Td className="text-right tabular-nums">{r.graduate ?? '—'}</Td>
                    <Td>
                      <Badge tone={j.status === 'SUCCEEDED' ? 'green' : j.status === 'FAILED' ? 'red' : 'blue'}>
                        {j.status.toLowerCase()}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
