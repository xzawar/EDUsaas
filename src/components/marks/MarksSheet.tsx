'use client';

import { Lock, Send, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton, useAction } from '@/components/overlay';
import { Alert, Badge, Button, Card, Stat, cx } from '@/components/ui';

type Band = { grade: string; min: number };
type Sheet = {
  id: string;
  name: string;
  maxMarks: number;
  status: 'DRAFT' | 'SUBMITTED' | 'PUBLISHED';
  bands: Band[];
  canEdit: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  editableUntil: string | null;
  lockedReason: string | null;
  stats: { count: number; average: number; highest: number; lowest: number } | null;
  students: { id: string; name: string; rollNumber: number | null; score: number | null; absent: boolean }[];
};

const grade = (bands: Band[], pct: number | null) =>
  pct === null ? null : ([...bands].sort((a, b) => b.min - a.min).find((b) => pct >= b.min)?.grade ?? null);

export function MarksSheet({ sheet }: { sheet: Sheet }) {
  const router = useRouter();
  const draftKey = `marks-draft:${sheet.id}`;
  const fromServer = useMemo(
    () =>
      Object.fromEntries(
        sheet.students.map((s) => [s.id, { score: s.score === null ? '' : String(s.score), absent: s.absent }]),
      ),
    [sheet.students],
  );
  const [rows, setRows] = useState<Record<string, { score: string; absent: boolean }>>(fromServer);
  const [restored, setRestored] = useState(false);
  const { run, busy } = useAction();

  // Local draft autosave (spec §7.1: teachers enter marks locally, then submit).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && sheet.canEdit) {
        setRows({ ...fromServer, ...JSON.parse(saved) });
        setRestored(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, [draftKey, fromServer, sheet.canEdit]);
  useEffect(() => {
    try {
      const changed = Object.keys(rows).some(
        (k) => rows[k]!.score !== fromServer[k]!.score || rows[k]!.absent !== fromServer[k]!.absent,
      );
      if (changed) localStorage.setItem(draftKey, JSON.stringify(rows));
      else localStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable */
    }
  }, [rows, draftKey, fromServer]);

  const invalid = Object.values(rows).some(
    (r) => r.score !== '' && (Number.isNaN(Number(r.score)) || Number(r.score) < 0 || Number(r.score) > sheet.maxMarks),
  );
  const filled = Object.values(rows).filter((r) => r.score !== '' || r.absent).length;

  async function save(submit: boolean) {
    const marks = Object.entries(rows)
      .filter(([, r]) => r.score !== '' || r.absent)
      .map(([studentId, r]) => ({
        studentId,
        score: r.absent || r.score === '' ? null : Number(r.score),
        absent: r.absent,
      }));
    const res = await run(
      '/assessments/' + sheet.id + '/marks',
      { method: 'PUT', body: { marks, submit } },
      submit ? 'Marks submitted' : 'Saved',
    );
    if (res) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      setRestored(false);
    }
  }

  const statusTone = { DRAFT: 'slate', SUBMITTED: 'blue', PUBLISHED: 'green' } as const;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTone[sheet.status]}>
          {sheet.status === 'DRAFT'
            ? 'Draft'
            : sheet.status === 'SUBMITTED'
              ? 'Submitted · waiting to publish'
              : 'Published to students'}
        </Badge>
        {sheet.editableUntil && sheet.canEdit && (
          <span className="text-sm text-slate-500">
            You can correct marks until{' '}
            {new Date(sheet.editableUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </div>
      {restored && <Alert tone="info">Restored unsaved marks from this device.</Alert>}
      {!sheet.canEdit && sheet.lockedReason && (
        <Alert tone="warning">
          <Lock className="mr-1 inline size-4" aria-hidden /> {sheet.lockedReason}
        </Alert>
      )}
      {sheet.stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Average" value={`${sheet.stats.average} / ${sheet.maxMarks}`} />
          <Stat label="Highest" value={sheet.stats.highest} />
          <Stat label="Lowest" value={sheet.stats.lowest} />
          <Stat label="Entered" value={`${sheet.stats.count} / ${sheet.students.length}`} />
        </div>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
              <th className="py-2 pr-2 font-medium">Roll</th>
              <th className="py-2 pr-2 font-medium">Student</th>
              <th className="py-2 pr-2 font-medium">Marks / {sheet.maxMarks}</th>
              <th className="py-2 pr-2 font-medium">Absent</th>
              <th className="py-2 text-right font-medium">Grade</th>
            </tr>
          </thead>
          <tbody>
            {sheet.students.map((s, i) => {
              const r = rows[s.id]!;
              const n = r.score === '' ? null : Number(r.score);
              const bad = n !== null && (Number.isNaN(n) || n < 0 || n > sheet.maxMarks);
              const g = !bad && n !== null ? grade(sheet.bands, (n / sheet.maxMarks) * 100) : null;
              return (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-500 tabular-nums">{s.rollNumber}</td>
                  <td className="py-1.5 pr-2 font-medium">{s.name}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      inputMode="decimal"
                      aria-label={`Marks for ${s.name}`}
                      value={r.score}
                      disabled={!sheet.canEdit || r.absent}
                      onChange={(e) =>
                        setRows({ ...rows, [s.id]: { ...r, score: e.target.value.replace(/[^\d.]/g, '') } })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          document.querySelectorAll<HTMLInputElement>('input[inputmode=decimal]')[i + 1]?.focus();
                        }
                        if (e.key === 'ArrowUp')
                          document.querySelectorAll<HTMLInputElement>('input[inputmode=decimal]')[i - 1]?.focus();
                      }}
                      className={cx(
                        'w-20 rounded-md border px-2 py-1 text-right tabular-nums disabled:bg-slate-50',
                        bad ? 'border-red-400 bg-red-50' : 'border-slate-300',
                      )}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      aria-label={`${s.name} was absent`}
                      checked={r.absent}
                      disabled={!sheet.canEdit}
                      onChange={(e) =>
                        setRows({
                          ...rows,
                          [s.id]: { score: e.target.checked ? '' : r.score, absent: e.target.checked },
                        })
                      }
                      className="size-4 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="py-1.5 text-right font-semibold">
                    {r.absent ? (
                      <span className="text-slate-400">AB</span>
                    ) : (
                      (g ?? <span className="text-slate-300">—</span>)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sticky bottom-16 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white py-3 lg:bottom-0">
          <span className="text-sm text-slate-600">
            {filled} of {sheet.students.length} entered
            {invalid && <span className="ml-2 text-red-700">· Fix marks above {sheet.maxMarks}</span>}
          </span>
          <div className="flex flex-wrap gap-2">
            {sheet.status === 'DRAFT' && sheet.canEdit && (
              <ConfirmButton
                variant="danger-ghost"
                size="sm"
                label={<Trash2 className="size-4" aria-label="Delete test" />}
                title="Delete this test?"
                message={<p>The test and any marks entered are removed.</p>}
                confirmLabel="Delete test"
                onConfirm={async () => {
                  if (await run(`/assessments/${sheet.id}`, { method: 'DELETE' }, 'Test deleted'))
                    router.push('/staff/assessments');
                }}
              />
            )}
            {sheet.canEdit && (
              <Button variant="secondary" disabled={busy || invalid} onClick={() => save(false)}>
                Save
              </Button>
            )}
            {sheet.canSubmit && (
              <ConfirmButton
                variant="primary"
                label={
                  <>
                    <Send className="size-4" /> Submit marks
                  </>
                }
                title="Submit marks?"
                message={
                  <p>
                    After submitting you can still correct marks for 7 days. Students see them once they’re published.
                  </p>
                }
                confirmLabel="Submit"
                tone="primary"
                onConfirm={() => save(true)}
              />
            )}
            {sheet.canPublish && (
              <ConfirmButton
                variant="primary"
                label="Publish to students"
                title="Publish these marks?"
                message={<p>Students in this section will see their marks and grades.</p>}
                confirmLabel="Publish"
                tone="primary"
                onConfirm={() => run(`/assessments/${sheet.id}/publish`, { method: 'POST' }, 'Marks published')}
              />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
