'use client';

import { CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/client/api';
import { enqueue } from '@/client/offline';
import { useToast } from '@/components/overlay';
import { Button } from '@/components/ui';

/** One-tap teacher check-in (spec §6.5). Works offline: the tap time is kept and synced later. */
export function CheckInCard({
  status,
  checkedInAt,
  userId,
  timezone,
}: {
  status: string | null;
  checkedInAt: string | null;
  userId: string;
  timezone: string;
}) {
  const toast = useToast();
  const [state, setState] = useState({ status, checkedInAt });
  const [busy, setBusy] = useState(false);
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone });

  async function checkIn() {
    setBusy(true);
    const body = { clientRecordedAt: new Date().toISOString() };
    const offline = async () => {
      await enqueue({
        id: crypto.randomUUID(),
        url: '/api/v1/teacher-attendance/check-in',
        body,
        label: 'Check-in',
        createdAt: body.clientRecordedAt,
        userId,
      });
      setState({ status: 'QUEUED', checkedInAt: body.clientRecordedAt });
      toast('success', 'Checked in on this device. It will sync when you’re online.');
    };
    if (!navigator.onLine) await offline();
    else {
      const r = await api<{ status: string; checkedInAt: string }>('/teacher-attendance/check-in', { body });
      if (r.ok) {
        setState({ status: r.data.status, checkedInAt: r.data.checkedInAt });
        toast('success', r.data.status === 'LATE' ? 'Checked in (marked late)' : 'Checked in');
      } else if (r.status === 0) await offline();
      else toast('error', r.error.message);
    }
    setBusy(false);
  }

  if (state.status)
    return (
      <div className="flex h-full items-center gap-4 rounded-2xl bg-[#dcf5ea] px-5 py-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white">
          <CheckCircle2 className="size-7 text-emerald-600" aria-hidden />
        </span>
        <p className="text-sm">
          <span className="font-semibold text-emerald-900">
            {state.status === 'QUEUED'
              ? 'Checked in (waiting to sync)'
              : state.status === 'LATE'
                ? 'Checked in · late'
                : 'Checked in'}
          </span>
          {state.checkedInAt && <span className="text-emerald-800"> at {time(state.checkedInAt)}</span>}
        </p>
      </div>
    );
  return (
    <div className="flex h-full flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#ecebff] px-5 py-5">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white">
          <Clock className="size-7 text-[var(--accent)]" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">Good to see you</p>
          <p className="text-sm text-slate-500">Check in for today.</p>
        </div>
      </div>
      <Button disabled={busy} onClick={checkIn} className="!bg-slate-900 hover:!bg-slate-800">
        {busy ? 'Checking in…' : 'Check in'}
      </Button>
    </div>
  );
}
