'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/client/api';
import { ConfirmButton, useAction, useToast } from '@/components/overlay';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, Stat, cx } from '@/components/ui';

type Year = { id: string; name: string; status: string };
type Candidate = {
  id: string;
  label: string;
  className: string;
  sectionName: string;
  gradeLevel: number;
  students: { id: string; name: string; rollNumber: number | null }[];
};
type Target = {
  id: string;
  label: string;
  name: string;
  gradeLevel: number;
  studentCount: number;
  capacity: number | null;
};
type Action = 'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'SKIP';
type Preview = {
  summary: {
    fromYear: string;
    toYear: string;
    promote: number;
    repeat: number;
    graduate: number;
    rollClashes: number;
    errors: string[];
  };
  rows: {
    studentId: string;
    name: string;
    from: string;
    to: string | null;
    action: string;
    oldRoll: number | null;
    newRoll: number | null;
    newUsername: string | null;
    rollChanged: boolean;
  }[];
};

const SKIP = '__skip';
const GRADUATE = '__graduate';

function defaultTarget(src: Candidate, targets: Target[]): string {
  const next = targets.filter((t) => t.gradeLevel === src.gradeLevel + 1);
  if (!next.length) return targets.some((t) => t.gradeLevel > src.gradeLevel) ? SKIP : GRADUATE;
  return (next.find((t) => t.name === src.sectionName) ?? next[0]!).id;
}

function repeatTarget(src: Candidate, targets: Target[]): string | undefined {
  const same = targets.filter((t) => t.gradeLevel === src.gradeLevel);
  return (same.find((t) => t.name === src.sectionName) ?? same[0])?.id;
}

export function PromotionWizard({
  years,
  fromYearId,
  toYearId,
  candidates,
  targets,
}: {
  years: Year[];
  fromYearId: string | null;
  toYearId: string | null;
  candidates: Candidate[];
  targets: Target[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { run } = useAction();
  const [sectionTarget, setSectionTarget] = useState<Record<string, string>>(() =>
    Object.fromEntries(candidates.map((c) => [c.id, defaultTarget(c, targets)])),
  );
  const [overrides, setOverrides] = useState<Record<string, Action>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Preview['summary'] | null>(null);

  const go = (from: string | null, to: string | null) => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    router.push(`/staff/promotion?${p.toString()}`);
  };

  const moves = useMemo(() => {
    const out: { studentId: string; action: Exclude<Action, 'SKIP'>; toSectionId?: string }[] = [];
    for (const c of candidates) {
      const t = sectionTarget[c.id] ?? SKIP;
      for (const s of c.students) {
        const o = overrides[s.id];
        if (o === 'SKIP' || (!o && t === SKIP)) continue;
        if (o === 'GRADUATE' || (!o && t === GRADUATE)) out.push({ studentId: s.id, action: 'GRADUATE' });
        else if (o === 'REPEAT') {
          const r = repeatTarget(c, targets);
          if (r) out.push({ studentId: s.id, action: 'REPEAT', toSectionId: r });
        } else out.push({ studentId: s.id, action: 'PROMOTE', toSectionId: t });
      }
    }
    return out;
  }, [candidates, sectionTarget, overrides, targets]);

  async function doPreview() {
    setLoading(true);
    const r = await api<Preview>('/promotions/preview', { body: { fromYearId, toYearId, moves } });
    setLoading(false);
    if (r.ok) setPreview(r.data);
    else toast('error', r.error.message);
  }

  if (done)
    return (
      <Card>
        <Alert tone="success">
          Promotion complete: {done.promote} promoted, {done.repeat} held back, {done.graduate} graduated into{' '}
          {done.toYear}.
          {done.rollClashes > 0 && ` ${done.rollClashes} students received new roll numbers because of clashes.`}
        </Alert>
        <p className="mt-4 text-sm text-slate-600">
          Next: make {done.toYear} the current year on the Classes & sections page when the new session starts. Report
          cards for {done.fromYear} will be archived once file storage is configured; no attendance or marks data has
          been deleted.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => router.push(`/staff/academics?year=${toYearId}`)}>Go to {done.toYear}</Button>
          <Button variant="secondary" onClick={() => router.refresh()}>
            Promote more
          </Button>
        </div>
      </Card>
    );

  return (
    <div className="space-y-6">
      <Card title="1. Choose years">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Promote students from" htmlFor="from-year">
            <Select id="from-year" value={fromYearId ?? ''} onChange={(e) => go(e.target.value, toYearId)}>
              <option value="">Choose…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.status === 'CURRENT' ? '(current)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Into"
            htmlFor="to-year"
            hint="Create next year and copy its structure on the Classes & sections page first."
          >
            <Select id="to-year" value={toYearId ?? ''} onChange={(e) => go(fromYearId, e.target.value)}>
              <option value="">Choose…</option>
              {years
                .filter((y) => y.id !== fromYearId && y.status !== 'CLOSED')
                .map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Card>

      {fromYearId && toYearId && (
        <Card
          title="2. Where does each section go?"
          description="Matched automatically by level and section name. Expand a section to hold back or graduate individual students."
        >
          {!targets.length ? (
            <EmptyState
              title="The target year has no sections"
              description="Copy the class structure into the target year first."
            />
          ) : !candidates.length ? (
            <EmptyState title="No students to promote in this year" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {candidates.map((c) => {
                const t = sectionTarget[c.id] ?? SKIP;
                const expanded = open === c.id;
                const overridden = c.students.filter((s) => overrides[s.id]).length;
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : c.id)}
                        className="flex w-40 items-center gap-1.5 text-left font-semibold"
                        aria-expanded={expanded}
                      >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {c.label}
                        <span className="text-xs font-normal text-slate-500">{c.students.length}</span>
                      </button>
                      <span className="text-slate-400">→</span>
                      <Select
                        aria-label={`Target for ${c.label}`}
                        value={t}
                        onChange={(e) => setSectionTarget((s) => ({ ...s, [c.id]: e.target.value }))}
                        className={cx('w-56', t === SKIP && 'text-slate-500')}
                      >
                        {targets.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                        <option value={GRADUATE}>Graduate (leaves school)</option>
                        <option value={SKIP}>Don’t promote yet</option>
                      </Select>
                      {overridden > 0 && (
                        <Badge tone="amber">
                          {overridden} individual change{overridden === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </div>
                    {expanded && (
                      <div className="mt-3 ml-6 grid gap-1.5 sm:grid-cols-2">
                        {c.students.map((s) => (
                          <label
                            key={s.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm"
                          >
                            <span className="truncate">
                              <span className="mr-2 text-xs text-slate-500 tabular-nums">{s.rollNumber}</span>
                              {s.name}
                            </span>
                            <select
                              aria-label={`Action for ${s.name}`}
                              value={overrides[s.id] ?? ''}
                              onChange={(e) =>
                                setOverrides((o) => {
                                  const n = { ...o };
                                  if (e.target.value) n[s.id] = e.target.value as Action;
                                  else delete n[s.id];
                                  return n;
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                            >
                              <option value="">Same as section</option>
                              <option value="REPEAT">Hold back</option>
                              <option value="GRADUATE">Graduate</option>
                              <option value="SKIP">Skip</option>
                            </select>
                          </label>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {candidates.length > 0 && targets.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-600">{moves.length} students selected</span>
              <Button disabled={!moves.length || loading} onClick={doPreview}>
                {loading ? 'Checking…' : 'Preview promotion'}
              </Button>
            </div>
          )}
        </Card>
      )}

      {preview && (
        <Card title="3. Review and run">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Promoted" value={preview.summary.promote} />
            <Stat label="Held back" value={preview.summary.repeat} />
            <Stat label="Graduating" value={preview.summary.graduate} />
            <Stat label="Roll clashes" value={preview.summary.rollClashes} hint="Get the next free roll" />
          </div>
          {preview.summary.errors.length > 0 && (
            <div className="mt-4">
              <Alert>{preview.summary.errors.join(' · ')}</Alert>
            </div>
          )}
          <p className="mt-4 text-sm text-slate-600">
            Roll numbers carry over. Every promoted student gets a new username (class and section change), effective
            immediately; nobody is notified. Graduating students can no longer sign in.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-[var(--accent)]">
              See all {preview.rows.length} changes
            </summary>
            <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Student</th>
                    <th className="px-3 py-2 text-left">Move</th>
                    <th className="px-3 py-2 text-left">New username</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((r) => (
                    <tr key={r.studentId} className={r.rollChanged ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5">
                        {r.from} → {r.action === 'GRADUATE' ? 'Graduated' : r.to}
                        {r.rollChanged && (
                          <span className="ml-1 text-xs text-amber-800">
                            (roll {r.oldRoll}→{r.newRoll})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.action === 'GRADUATE' ? '—' : r.newUsername}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="mt-4 flex justify-end">
            <ConfirmButton
              variant="primary"
              label={`Run promotion for ${preview.rows.length} students`}
              title="Run promotion?"
              message={
                <p>
                  {preview.summary.promote + preview.summary.repeat} students move into {preview.summary.toYear} and get
                  new usernames; {preview.summary.graduate} graduate. This is recorded in the audit log.
                </p>
              }
              requireText="PROMOTE"
              confirmLabel="Run promotion"
              onConfirm={async () => {
                const r = await run<{ jobId: string; summary: Preview['summary'] }>(
                  '/promotions',
                  { body: { fromYearId, toYearId, moves } },
                  'Promotion complete',
                );
                if (r) {
                  setDone(r.summary);
                  setPreview(null);
                }
              }}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
