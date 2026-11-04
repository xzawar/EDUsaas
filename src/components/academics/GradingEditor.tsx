'use client';

import { useState } from 'react';
import { useAction } from '@/components/overlay';
import { Alert, Button, Input } from '@/components/ui';

type Band = { grade: string; min: number };

export function GradingEditor({ yearName, bands, inUse }: { yearName: string; bands: Band[]; inUse: boolean }) {
  const [rows, setRows] = useState(bands.map((b) => ({ grade: b.grade, min: String(b.min) })));
  const { run, busy, error } = useAction();
  const sorted = [...rows].map((r) => ({ grade: r.grade, min: Number(r.min) })).sort((a, b) => b.min - a.min);
  return (
    <div className="space-y-4">
      {inUse && <Alert tone="info">Tests already use this scale, so saving creates a new version for future tests. Results already issued keep their grades.</Alert>}
      {error && <Alert>{error.message}</Alert>}
      <table className="text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="pr-3 text-left font-medium">Grade</th>
            <th className="pr-3 text-left font-medium">From (%)</th>
            <th className="text-left font-medium">Range</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const idx = sorted.findIndex((s) => s.grade === r.grade && s.min === Number(r.min));
            const upper = idx > 0 ? sorted[idx - 1]!.min - 0.1 : 100;
            return (
              <tr key={i}>
                <td className="py-1 pr-3">
                  <Input value={r.grade} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} className="w-20 py-1" aria-label={`Grade ${i + 1} name`} />
                </td>
                <td className="py-1 pr-3">
                  <Input type="number" min={0} max={100} value={r.min} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} className="w-24 py-1" aria-label={`Grade ${i + 1} minimum`} />
                </td>
                <td className="py-1 text-slate-500 tabular-nums">
                  {r.min}–{Number.isFinite(upper) ? Math.round(upper * 10) / 10 : 100}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setRows([...rows, { grade: '', min: '' }])}>
          Add grade
        </Button>
        {rows.length > 2 && (
          <Button variant="ghost" size="sm" onClick={() => setRows(rows.slice(0, -1))}>
            Remove last
          </Button>
        )}
        <Button size="sm" disabled={busy} onClick={() => run('/grading-scheme', { method: 'PUT', body: { bands: rows.map((r) => ({ grade: r.grade.trim(), min: Number(r.min) })) } }, `Grading scale for ${yearName} saved`)}>
          Save scale
        </Button>
      </div>
    </div>
  );
}
