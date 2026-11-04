import { ClipboardList } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/AppShell';
import { Badge, Card, EmptyState, Table, Td, Th } from '@/components/ui';
import { requirePortal } from '@/server/auth/page';
import { studentResults, studentRemarks } from '@/server/school/assessments';
import { inTenant } from '@/server/school/common';

export const metadata: Metadata = { title: 'Marks' };

export default async function StudentMarksPage() {
  const ctx = await requirePortal('STUDENT');
  const me = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
  );
  const [r, remarks] = me
    ? await Promise.all([studentResults(ctx, me.id), studentRemarks(ctx, me.id, true)])
    : [{ items: [], subjects: [] }, []];
  return (
    <>
      <PageHeader title="Marks" description="Published marks for this academic year." />
      {r.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title="No published marks yet"
            description="Marks appear here after your teachers submit them and the school publishes them."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {r.subjects.map((s) => (
              <div key={s.subject} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="truncate text-sm text-slate-500">{s.subject}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold">{s.grade ?? '—'}</span>
                  <span className="text-sm text-slate-500 tabular-nums">{s.pct}%</span>
                </p>
              </div>
            ))}
          </div>
          <Card title="All tests">
            <Table>
              <thead>
                <tr>
                  <Th>Test</Th>
                  <Th className="hidden sm:table-cell">Date</Th>
                  <Th className="text-right">Marks</Th>
                  <Th className="text-right">Grade</Th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <span className="font-medium">{i.name}</span>
                      <span className="block text-xs text-slate-500">{i.subject}</span>
                    </Td>
                    <Td className="hidden text-slate-600 sm:table-cell">
                      {new Date(`${i.heldOn}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {i.absent ? <Badge>Absent</Badge> : `${i.score} / ${i.maxMarks}`}
                    </Td>
                    <Td className="text-right font-semibold">{i.grade ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
      {remarks.length > 0 && (
        <Card className="mt-6" title="Teacher remarks">
          <ul className="space-y-3">
            {remarks.map((m) => (
              <li key={m.id} className="text-sm">
                <p className="text-slate-800">“{m.text}”</p>
                <p className="text-xs text-slate-500">
                  {m.author}
                  {m.subject ? ` · ${m.subject}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
