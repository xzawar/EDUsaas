'use client';

import { CheckCheck, CloudOff, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/client/api';
import { enqueue, pending } from '@/client/offline';
import { Modal, useToast } from '@/components/overlay';
import { STATUS_STYLE } from '@/components/attendance/StatusPill';
import { Alert, Button, Card, Input, cx } from '@/components/ui';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' | 'EXCUSED';
type Sheet = {
  section: { id: string; label: string };
  date: string;
  today: string;
  timezone: string;
  submitted: { at: string | Date; by: string; syncedLate: boolean } | null;
  canEdit: boolean;
  lockedReason: string | null;
  editableUntil: string | null;
  students: { id: string; name: string; rollNumber: number | null; status: Status | null; onApprovedLeave: boolean }[];
};

const MAIN: Status[] = ['PRESENT', 'ABSENT', 'LATE'];
const friendlyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

export function Register({ sheet, userId }: { sheet: Sheet; userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const initial = useMemo(
    () =>
      Object.fromEntries(sheet.students.map((s) => [s.id, s.status ?? (s.onApprovedLeave ? 'LEAVE' : null)])) as Record<
        string,
        Status | null
      >,
    [sheet.students],
  );
  const [marks, setMarks] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [queued, setQueued] = useState(false);
  const queueKey = `${sheet.section.id}:${sheet.date}`;

  useEffect(() => {
    void pending(userId).then((items) => setQueued(items.some((i) => i.label.endsWith(queueKey))));
  }, [userId, queueKey]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0, unmarked: 0 };
    for (const v of Object.values(marks)) c[v ?? 'unmarked']!++;
    return c;
  }, [marks]);
  const dirty = Object.keys(marks).some((k) => marks[k] !== initial[k]);
  const locked = !sheet.canEdit;

  const set = (id: string, s: Status) => !locked && setMarks((m) => ({ ...m, [id]: s }));
  const allPresent = () =>
    setMarks(
      (m) =>
        Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v ?? 'PRESENT'])) as Record<string, Status | null>,
    );

  /** Unmarked students are submitted as present (the confirm dialog says so). */
  async function submit() {
    setConfirm(false);
    const records = Object.entries(marks).map(([studentId, status]) => ({ studentId, status: status ?? 'PRESENT' }));
    const body = {
      sectionId: sheet.section.id,
      date: sheet.date,
      clientUuid: crypto.randomUUID(),
      clientRecordedAt: new Date().toISOString(),
      records,
    };
    const label = `Attendance ${sheet.section.label} ${sheet.date} · ${queueKey}`;
    const saveOffline = async () => {
      await enqueue({
        id: body.clientUuid,
        url: '/api/v1/attendance/batches',
        body,
        label,
        createdAt: body.clientRecordedAt,
        userId,
      });
      setQueued(true);
      toast('success', 'Saved on this device. It will sync automatically when you’re back online.');
    };
    setBusy(true);
    if (!navigator.onLine) {
      await saveOffline();
      setBusy(false);
      return;
    }
    const res = await api<{ corrected: boolean; duplicate: boolean }>('/attendance/batches', { body });
    setBusy(false);
    if (res.ok) {
      toast('success', res.data.corrected ? 'Attendance updated' : 'Attendance saved');
      router.refresh();
    } else if (res.status === 0) await saveOffline();
    else toast('error', res.error.message);
  }

  return (
    <div className="space-y-4">
      {sheet.submitted && (
        <Alert tone="success">
          Submitted by {sheet.submitted.by} at{' '}
          {new Date(sheet.submitted.at).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: sheet.timezone,
          })}
          {sheet.submitted.syncedLate && ' · synced late (taken offline)'}
          {sheet.canEdit && sheet.editableUntil && ` · you can correct it until ${friendlyDate(sheet.editableUntil)}`}
        </Alert>
      )}
      {locked && (
        <Alert tone="warning">
          <Lock className="mr-1 inline size-4" aria-hidden /> {sheet.lockedReason}
        </Alert>
      )}
      {queued && (
        <Alert tone="info">
          <CloudOff className="mr-1 inline size-4" aria-hidden /> This register is saved on your device and waiting to
          sync.
        </Alert>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED'] as Status[]).map((s) => (
              <span key={s} className={cx('rounded-md px-2 py-1 font-medium ring-1', STATUS_STYLE[s]!.cls)}>
                {STATUS_STYLE[s]!.label} {counts[s]}
              </span>
            ))}
            {counts.unmarked! > 0 && (
              <span className="rounded-md bg-white px-2 py-1 font-medium text-slate-600 ring-1 ring-slate-300">
                Not marked {counts.unmarked}
              </span>
            )}
          </div>
          {!locked && (
            <Button variant="secondary" size="sm" onClick={allPresent}>
              <CheckCheck className="size-4" /> Mark rest present
            </Button>
          )}
        </div>
        <ul className="divide-y divide-slate-100">
          {sheet.students.map((s) => {
            const cur = marks[s.id];
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="w-8 text-right text-sm text-slate-500 tabular-nums">{s.rollNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  {s.onApprovedLeave && <span className="text-xs text-sky-700">On approved leave</span>}
                </span>
                <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                  {MAIN.map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={cur === st}
                      aria-label={STATUS_STYLE[st]!.label}
                      disabled={locked}
                      onClick={() => set(s.id, st)}
                      className={cx(
                        'size-10 rounded-lg text-sm font-semibold ring-1 transition disabled:opacity-60',
                        cur === st
                          ? STATUS_STYLE[st]!.cls + ' ring-2'
                          : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {STATUS_STYLE[st]!.short}
                    </button>
                  ))}
                  <select
                    aria-label={`More options for ${s.name}`}
                    disabled={locked}
                    value={cur === 'LEAVE' || cur === 'EXCUSED' ? cur : ''}
                    onChange={(e) => e.target.value && set(s.id, e.target.value as Status)}
                    className={cx(
                      'h-10 rounded-lg border-0 px-1.5 text-xs ring-1',
                      cur === 'LEAVE' || cur === 'EXCUSED'
                        ? STATUS_STYLE[cur]!.cls
                        : 'bg-white text-slate-500 ring-slate-200',
                    )}
                  >
                    <option value="">More</option>
                    <option value="LEAVE">Leave</option>
                    <option value="EXCUSED">Excused</option>
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
        {!locked && (
          <div className="sticky bottom-16 mt-4 flex items-center justify-between gap-3 border-t border-slate-100 bg-white py-3 lg:bottom-0">
            <span className="text-sm text-slate-600">
              {counts.unmarked ? `${counts.unmarked} not marked yet` : 'Everyone marked'}
            </span>
            <Button
              disabled={busy || queued || (!dirty && !!sheet.submitted)}
              onClick={() => (counts.unmarked ? setConfirm(true) : submit())}
            >
              {busy ? 'Saving…' : sheet.submitted ? 'Save changes' : 'Submit attendance'}
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`${counts.unmarked} students not marked`}
        description="Submit anyway and mark them present?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Go back
            </Button>
            <Button onClick={() => submit()}>Mark present & submit</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">You can still correct this register for the next 3 days.</p>
      </Modal>
    </div>
  );
}

export function DatePicker({ sectionId, date, today }: { sectionId: string; date: string; today: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        value={date}
        max={today}
        onChange={(e) => e.target.value && router.push(`/staff/attendance/${sectionId}?date=${e.target.value}`)}
        className="w-44"
        aria-label="Date"
      />
      {date !== today && (
        <Link
          href={`/staff/attendance/${sectionId}`}
          className="text-sm font-medium text-[var(--accent)] hover:underline"
        >
          Today
        </Link>
      )}
      <Link
        href={`/staff/attendance/${sectionId}/month`}
        className="text-sm font-medium text-[var(--accent)] hover:underline"
      >
        Month view
      </Link>
    </div>
  );
}
