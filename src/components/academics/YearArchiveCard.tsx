'use client';

import { Archive } from 'lucide-react';
import { useAction } from '@/components/overlay';
import { Badge, Button, Card } from '@/components/ui';

type Job = {
  id: string;
  year: string;
  total: number;
  done: number;
  archived: number;
  failed: number;
  status: string;
  error: string | null;
};

/** After promotion: each closed year's report cards are stored, then that year's raw records are cleared. */
export function YearArchiveCard({ jobs, storageReady }: { jobs: Job[]; storageReady: boolean }) {
  const { run, busy } = useAction();
  if (!jobs.length) return null;
  return (
    <Card
      className="mt-6"
      title="Year archive"
      description="After promotion, each student’s report card for the finished year is saved as a PDF. Then that year’s daily attendance and marks are cleared to keep the database small."
    >
      {!storageReady && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          File storage isn’t set up yet, so archiving is waiting. Nothing is deleted until each report card is safely
          saved.
        </p>
      )}
      <ul className="space-y-3">
        {jobs.map((j) => {
          const pct = j.total ? Math.round((j.done / j.total) * 100) : 100;
          const finished = j.status === 'SUCCEEDED' || j.status === 'FAILED';
          return (
            <li key={j.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Archive className="size-4 text-slate-500" aria-hidden /> {j.year}: {j.archived} of {j.total} report
                  cards saved
                </p>
                {finished ? (
                  <Badge tone={j.status === 'SUCCEEDED' ? 'green' : 'amber'}>
                    {j.status === 'SUCCEEDED' ? 'Done' : `${j.failed} need attention`}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={busy || !storageReady}
                    onClick={() => run(`/promotions/archive/${j.id}`, { method: 'POST' }, 'Archived the next batch')}
                  >
                    Continue now
                  </Button>
                )}
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${j.year} archive progress`}
              >
                <div className="h-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
              </div>
              {j.error && <p className="mt-1 text-xs text-amber-800">{j.error}</p>}
              {!finished && (
                <p className="mt-1 text-xs text-slate-500">The nightly job also continues this automatically.</p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
