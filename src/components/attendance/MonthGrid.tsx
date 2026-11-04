'use client';

import { useState } from 'react';
import { useAction } from '@/components/overlay';
import { STATUS_STYLE, StatusPill } from '@/components/attendance/StatusPill';
import { Modal } from '@/components/overlay';
import { Button, cx } from '@/components/ui';

type Grid = {
  section: { id: string; label: string };
  days: string[];
  canEditAll: boolean;
  editableFrom: string | null;
  today: string;
  rows: { id: string; name: string; rollNumber: number | null; statuses: (string | null)[]; pct: number | null }[];
};

export function MonthGrid({ grid, threshold }: { grid: Grid; threshold: number }) {
  const [edit, setEdit] = useState<{ studentId: string; name: string; date: string; status: string | null } | null>(null);
  const { run, busy } = useAction();
  const editable = (d: string) => d <= grid.today && (grid.canEditAll || (grid.editableFrom !== null && d >= grid.editableFrom));

  if (!grid.days.length) return <p className="py-8 text-center text-sm text-slate-500">No attendance recorded this month yet.</p>;
  return (
    <>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-medium">Student</th>
              {grid.days.map((d) => (
                <th key={d} className="px-0.5 py-2 text-center font-medium tabular-nums" title={d}>
                  {Number(d.slice(8))}
                </th>
              ))}
              <th className="pl-3 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white py-1.5 pr-3 whitespace-nowrap">
                  <span className="mr-1.5 text-xs text-slate-400 tabular-nums">{r.rollNumber}</span>
                  {r.name}
                </td>
                {r.statuses.map((st, i) => {
                  const d = grid.days[i]!;
                  const can = editable(d);
                  return (
                    <td key={d} className="px-0.5 py-1 text-center">
                      <button
                        type="button"
                        disabled={!can}
                        onClick={() => setEdit({ studentId: r.id, name: r.name, date: d, status: st })}
                        className={cx('rounded', can && 'hover:ring-2 hover:ring-[var(--accent)]/40')}
                        aria-label={`${r.name}, ${d}: ${st ? STATUS_STYLE[st]!.label : 'not recorded'}${can ? ', change' : ''}`}
                      >
                        <StatusPill status={st} compact />
                      </button>
                    </td>
                  );
                })}
                <td className={cx('pl-3 text-right font-medium tabular-nums', r.pct !== null && r.pct < threshold ? 'text-red-700' : 'text-slate-900')}>{r.pct ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.name} · ${edit.date}` : ''} description="Every change is recorded in the audit log.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Object.entries(STATUS_STYLE).map(([k, v]) => (
            <Button
              key={k}
              variant="secondary"
              disabled={busy}
              className={cx(edit?.status === k && 'ring-2 ring-[var(--accent)]')}
              onClick={async () => {
                if (!edit) return;
                if (await run('/attendance/records', { body: { sectionId: grid.section.id, date: edit.date, studentId: edit.studentId, status: k } }, 'Attendance corrected')) setEdit(null);
              }}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
