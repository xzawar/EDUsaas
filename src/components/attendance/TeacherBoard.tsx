'use client';

import { useRouter } from 'next/navigation';
import { useAction } from '@/components/overlay';
import { Input, Select, Table, Td, Th, cx } from '@/components/ui';

type Row = { teacherId: string; name: string; status: string | null; checkedInAt: string | Date | null; corrected: boolean };
const TONE: Record<string, string> = { PRESENT: 'text-emerald-700', LATE: 'text-amber-700', ABSENT: 'text-red-700', LEAVE: 'text-sky-700' };

export function TeacherBoard({ date, today, rows, timezone }: { date: string; today: string; rows: Row[]; timezone: string }) {
  const router = useRouter();
  const { run, busy } = useAction();
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Input type="date" value={date} max={today} onChange={(e) => e.target.value && router.push(`/staff/teacher-attendance?date=${e.target.value}`)} className="w-44" aria-label="Date" />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Teacher</Th>
            <Th>Checked in</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teacherId}>
              <Td className="font-medium">{r.name}</Td>
              <Td className="text-slate-600 tabular-nums">
                {r.checkedInAt ? new Date(r.checkedInAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone }) : '—'}
                {r.corrected && <span className="ml-1.5 text-xs text-slate-500">(corrected)</span>}
              </Td>
              <Td>
                <Select
                  aria-label={`Status for ${r.name}`}
                  value={r.status ?? ''}
                  disabled={busy}
                  onChange={(e) => e.target.value && run('/teacher-attendance', { method: 'PUT', body: { teacherId: r.teacherId, date, status: e.target.value } }, `${r.name} updated`)}
                  className={cx('w-36 py-1.5', r.status ? TONE[r.status] : 'text-slate-400')}
                >
                  <option value="">Not checked in</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="ABSENT">Absent</option>
                  <option value="LEAVE">On leave</option>
                </Select>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
