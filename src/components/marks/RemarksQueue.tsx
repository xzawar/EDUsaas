'use client';

import { useAction } from '@/components/overlay';
import { Badge, Button, EmptyState } from '@/components/ui';

type Row = { id: string; text: string; subject: string | null; author: string; student: string; section: string };

export function RemarksQueue({ rows }: { rows: Row[] }) {
  const { run, busy } = useAction();
  if (!rows.length) return <EmptyState title="No remarks waiting for review" description="Remarks teachers write about students in your sections appear here before students can see them." />;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">
              {r.student} <Badge>{r.section}</Badge> {r.subject && <span className="text-sm font-normal text-slate-500">· {r.subject}</span>}
            </p>
            <p className="mt-0.5 text-sm text-slate-700">“{r.text}”</p>
            <p className="text-xs text-slate-500">by {r.author}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(`/remarks/${r.id}/moderate`, { body: { decision: 'REJECTED' } }, 'Remark hidden')}>
              Hide
            </Button>
            <Button size="sm" disabled={busy} onClick={() => run(`/remarks/${r.id}/moderate`, { body: { decision: 'APPROVED' } }, 'Remark approved')}>
              Approve
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
