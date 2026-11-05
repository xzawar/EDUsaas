'use client';

import { useState } from 'react';
import { FieldError, Modal, useAction } from '@/components/overlay';
import { Alert, Button, Field, Input, Select, cx } from '@/components/ui';

export type Cell = {
  slotId: string;
  isBreak: boolean;
  entry: {
    subject: string;
    subjectId: string;
    teacher: string | null;
    teacherId: string | null;
    room: string | null;
    section?: string;
  } | null;
};
export type Grid = {
  days: { day: number; name: string }[];
  periods: { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean }[];
  cells: Record<string, Cell>;
};
type Subject = { id: string; name: string; teachers: { id: string; name: string }[] };

/** Weekly grid: periods down, days across. On phones it scrolls sideways; today's column is highlighted. */
export function TimetableGrid({
  grid,
  today,
  edit,
}: {
  grid: Grid;
  today?: number;
  edit?: { sectionId: string; subjects: Subject[]; allTeachers: { id: string; name: string }[] };
}) {
  const [cell, setCell] = useState<(Cell & { label: string }) | null>(null);
  return (
    <>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-20" />
              {grid.days.map((d) => (
                <th
                  key={d.day}
                  className={cx(
                    'rounded-md py-1.5 text-xs font-semibold',
                    d.day === today ? 'bg-[var(--accent)] text-white' : 'text-slate-500',
                  )}
                >
                  {d.name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.periods.map((p) => (
              <tr key={p.periodNo}>
                <th className="pr-1 text-left align-top text-xs font-medium text-slate-500">
                  {p.isBreak
                    ? 'Break'
                    : `P${p.periodNo - grid.periods.filter((x) => x.isBreak && x.periodNo < p.periodNo).length}`}
                  <span className="block font-normal tabular-nums">{p.startsAt}</span>
                </th>
                {grid.days.map((d) => {
                  const c = grid.cells[`${d.day}:${p.periodNo}`];
                  if (!c) return <td key={d.day} />;
                  if (c.isBreak)
                    return (
                      <td key={d.day} className="rounded-md bg-slate-100 text-center text-xs text-slate-400">
                        —
                      </td>
                    );
                  const content = c.entry ? (
                    <>
                      <span className="block truncate font-medium">{c.entry.subject}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {c.entry.section ?? c.entry.teacher ?? 'No teacher'}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-slate-300">{edit ? '+ Add' : 'Free'}</span>
                  );
                  return (
                    <td key={d.day} className="align-top">
                      {edit ? (
                        <button
                          type="button"
                          onClick={() => setCell({ ...c, label: `${d.name}, ${p.startsAt}–${p.endsAt}` })}
                          className={cx(
                            'h-14 w-full rounded-md px-2 py-1 text-left ring-1 transition hover:ring-[var(--accent)]',
                            c.entry ? 'bg-[var(--accent)]/10 ring-[var(--accent)]/20' : 'bg-white ring-slate-200',
                          )}
                        >
                          {content}
                        </button>
                      ) : (
                        <div
                          className={cx(
                            'h-14 rounded-md px-2 py-1 ring-1',
                            c.entry ? 'bg-[var(--accent)]/10 ring-[var(--accent)]/20' : 'bg-white ring-slate-100',
                            d.day === today && 'ring-[var(--accent)]/50',
                          )}
                        >
                          {content}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && cell && <EntryModal key={cell.slotId} cell={cell} edit={edit} onClose={() => setCell(null)} />}
    </>
  );
}

function EntryModal({
  cell,
  edit,
  onClose,
}: {
  cell: Cell & { label: string };
  edit: { sectionId: string; subjects: Subject[]; allTeachers: { id: string; name: string }[] };
  onClose: () => void;
}) {
  const [subjectId, setSubjectId] = useState(cell.entry?.subjectId ?? edit.subjects[0]?.id ?? '');
  const subject = edit.subjects.find((s) => s.id === subjectId);
  const [teacherId, setTeacherId] = useState(cell.entry?.teacherId ?? subject?.teachers[0]?.id ?? '');
  const [room, setRoom] = useState(cell.entry?.room ?? '');
  const { run, busy, error } = useAction();
  const others = edit.allTeachers.filter((t) => !subject?.teachers.some((x) => x.id === t.id));
  const save = (clear: boolean) =>
    run(
      '/timetable/entries',
      {
        method: 'PUT',
        body: {
          sectionId: edit.sectionId,
          slotId: cell.slotId,
          subjectId: clear ? null : subjectId,
          teacherId: teacherId || null,
          room: room || null,
        },
      },
      clear ? 'Period cleared' : 'Timetable updated',
    ).then((ok) => ok && onClose());
  return (
    <Modal
      open
      onClose={onClose}
      title={cell.label}
      footer={
        <>
          {cell.entry && (
            <Button variant="danger-ghost" disabled={busy} onClick={() => save(true)}>
              Clear
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !subjectId} onClick={() => save(false)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert>{error.message}</Alert>}
        <Field label="Subject" htmlFor="tt-subject">
          <Select
            id="tt-subject"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setTeacherId(edit.subjects.find((s) => s.id === e.target.value)?.teachers[0]?.id ?? '');
            }}
          >
            {edit.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teacher" htmlFor="tt-teacher" hint="Teachers assigned to this subject are listed first.">
          <Select id="tt-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">No teacher</option>
            {subject?.teachers.length ? (
              <optgroup label="Assigned">
                {subject.teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="Other teachers">
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label="Room (optional)" htmlFor="tt-room">
          <Input id="tt-room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Lab 1" />
          <FieldError message={undefined} />
        </Field>
      </div>
    </Modal>
  );
}

export function PeriodsEditor({ days, periods }: { days: number[]; periods: Grid['periods'] }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(new Set(days));
  const [p, setP] = useState(periods.map((x) => ({ startsAt: x.startsAt, endsAt: x.endsAt, isBreak: x.isBreak })));
  const { run, busy, error } = useAction();
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        School days & periods
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="School days & periods"
        description="Applies to every class. Lessons already placed in a kept day and period stay."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () =>
                (await run(
                  '/timetable/periods',
                  { method: 'PUT', body: { days: [...d].sort(), periods: p } },
                  'Periods saved',
                )) && setOpen(false)
              }
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert>{error.message}</Alert>}
          <div className="flex flex-wrap gap-2">
            {NAMES.map((n, i) => {
              const day = i + 1;
              const on = d.has(day);
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const s = new Set(d);
                    if (on) s.delete(day);
                    else s.add(day);
                    setD(s);
                  }}
                  className={cx(
                    'rounded-full border px-3 py-1 text-sm',
                    on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-slate-300 text-slate-600',
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="text-left font-medium">#</th>
                <th className="text-left font-medium">Starts</th>
                <th className="text-left font-medium">Ends</th>
                <th className="text-left font-medium">Break</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.map((row, i) => (
                <tr key={i}>
                  <td className="py-1 text-slate-500">{i + 1}</td>
                  <td className="py-1">
                    <Input
                      type="time"
                      value={row.startsAt}
                      onChange={(e) => setP(p.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)))}
                      className="w-28 py-1"
                      aria-label={`Period ${i + 1} start`}
                    />
                  </td>
                  <td className="py-1">
                    <Input
                      type="time"
                      value={row.endsAt}
                      onChange={(e) => setP(p.map((x, j) => (j === i ? { ...x, endsAt: e.target.value } : x)))}
                      className="w-28 py-1"
                      aria-label={`Period ${i + 1} end`}
                    />
                  </td>
                  <td className="py-1">
                    <input
                      type="checkbox"
                      checked={row.isBreak}
                      onChange={(e) => setP(p.map((x, j) => (j === i ? { ...x, isBreak: e.target.checked } : x)))}
                      className="size-4 accent-[var(--accent)]"
                      aria-label={`Period ${i + 1} is a break`}
                    />
                  </td>
                  <td className="py-1 text-right">
                    {p.length > 1 && i === p.length - 1 && (
                      <Button variant="ghost" size="sm" onClick={() => setP(p.slice(0, -1))}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.length < 14 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const last = p[p.length - 1]!;
                const [h, m] = last.endsAt.split(':').map(Number) as [number, number];
                const end = h * 60 + m + 40;
                setP([
                  ...p,
                  {
                    startsAt: last.endsAt,
                    endsAt: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
                    isBreak: false,
                  },
                ]);
              }}
            >
              Add period
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}
