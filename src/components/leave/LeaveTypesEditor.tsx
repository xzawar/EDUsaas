'use client';

import { useState } from 'react';
import { useAction } from '@/components/overlay';
import { Badge, Button, Input } from '@/components/ui';

type T = {
  id: string;
  name: string;
  forStudents: boolean;
  forStaff: boolean;
  paid: boolean;
  archivedAt: string | Date | null;
  used: number;
};

/** Settings → leave types: add, choose who can use each, retire. */
export function LeaveTypesEditor({ types }: { types: T[] }) {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const patch = (id: string, body: Record<string, boolean>) =>
    run(`/leave/types/${id}`, { method: 'PATCH', body }, 'Leave type updated');
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-100">
        {types.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="font-medium">{t.name}</span> {t.archivedAt && <Badge>Retired</Badge>}
              <span className="block text-xs text-slate-500">
                Used {t.used} time{t.used === 1 ? '' : 's'}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={busy || !!t.archivedAt}
                  checked={t.forStudents}
                  onChange={(e) => patch(t.id, { forStudents: e.target.checked })}
                />{' '}
                Students
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={busy || !!t.archivedAt}
                  checked={t.forStaff}
                  onChange={(e) => patch(t.id, { forStaff: e.target.checked })}
                />{' '}
                Staff
              </label>
              <label className="flex items-center gap-1.5" title="Unpaid leave is deducted from salary in payroll">
                <input
                  type="checkbox"
                  className="size-4"
                  disabled={busy || !!t.archivedAt}
                  checked={t.paid}
                  onChange={(e) => patch(t.id, { paid: e.target.checked })}
                />{' '}
                Paid
              </label>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => patch(t.id, { archived: !t.archivedAt })}
              >
                {t.archivedAt ? 'Bring back' : 'Retire'}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run('/leave/types', { body: { name } }, 'Leave type added')) setName('');
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New leave type, e.g. Exam leave"
          aria-label="New leave type"
          className="max-w-xs"
          maxLength={60}
        />
        <Button type="submit" disabled={busy || name.trim().length < 2}>
          Add
        </Button>
      </form>
    </div>
  );
}
