'use client';

import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmButton, Modal, useAction } from '@/components/overlay';
import { Badge, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  audienceLabel: string;
  pinned: boolean;
  author: string;
  createdAt: string | Date;
  expiresOn: string | null;
  expired: boolean;
};

const when = (d: string | Date) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });

export function AnnouncementCard({ a, canManage }: { a: AnnouncementItem; canManage?: boolean }) {
  const { run } = useAction();
  return (
    <article
      className={cx(
        'rounded-xl border bg-white p-4 shadow-sm',
        a.pinned ? 'border-[var(--accent)]/40' : 'border-slate-200',
        a.expired && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
          {a.pinned ? <Pin className="size-4" aria-label="Pinned" /> : <Megaphone className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{a.title}</h3>
          <p className="text-xs text-slate-500">
            {a.author} · {when(a.createdAt)} · <span className="font-medium">{a.audienceLabel}</span>
            {a.expiresOn && (a.expired ? ' · ended' : ` · until ${when(a.expiresOn)}`)}
          </p>
          <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{a.body}</p>
        </div>
        {canManage && (
          <ConfirmButton
            label={<Trash2 className="size-4" aria-label={`Remove ${a.title}`} />}
            variant="ghost"
            size="sm"
            title="Remove this announcement?"
            message="It disappears for everyone. Notifications already sent stay in people’s inboxes."
            confirmLabel="Remove"
            onConfirm={() => run(`/announcements/${a.id}`, { method: 'DELETE' }, 'Announcement removed')}
          />
        )}
      </div>
    </article>
  );
}

export function NewAnnouncementButton({ sections }: { sections: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const { run, busy, error } = useAction();
  const [audience, setAudience] = useState<'EVERYONE' | 'STAFF' | 'STUDENTS' | 'SECTION'>('EVERYONE');
  const [form, setForm] = useState({ title: '', body: '', sectionId: '', pinned: false, expiresOn: '' });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run<{ recipients: number }>('/announcements', {
      body: {
        title: form.title,
        body: form.body,
        audience,
        sectionId: audience === 'SECTION' ? form.sectionId || null : null,
        pinned: form.pinned,
        expiresOn: form.expiresOn || null,
      },
    });
    if (r) {
      setOpen(false);
      setForm({ title: '', body: '', sectionId: '', pinned: false, expiresOn: '' });
      setAudience('EVERYONE');
    }
  }

  const options = [
    { key: 'EVERYONE', label: 'Everyone' },
    { key: 'STAFF', label: 'All staff' },
    { key: 'STUDENTS', label: 'All students' },
    { key: 'SECTION', label: 'One section' },
  ] as const;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New announcement
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New announcement"
        description="Everyone in the audience gets a notification."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-announcement" disabled={busy}>
              {busy ? 'Posting…' : 'Post'}
            </Button>
          </>
        }
      >
        <form id="new-announcement" onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Who should see it?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {options.map((o) => (
                <label
                  key={o.key}
                  className={cx(
                    'cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition',
                    audience === o.key
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={o.key}
                    checked={audience === o.key}
                    onChange={() => setAudience(o.key)}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {audience === 'SECTION' && (
            <Field label="Section" htmlFor="ann-section">
              <Select
                id="ann-section"
                required
                value={form.sectionId}
                onChange={(e) => set('sectionId', e.target.value)}
              >
                <option value="">Choose a section</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Title" htmlFor="ann-title">
            <Input
              id="ann-title"
              required
              maxLength={120}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. School closed on Friday"
            />
          </Field>
          <Field label="Message" htmlFor="ann-body">
            <Textarea
              id="ann-body"
              required
              rows={5}
              maxLength={4000}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Show until (optional)" htmlFor="ann-until">
              <Input
                id="ann-until"
                type="date"
                value={form.expiresOn}
                onChange={(e) => set('expiresOn', e.target.value)}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => set('pinned', e.target.checked)}
                className="size-4 rounded border-slate-300"
              />
              Pin to the top
            </label>
          </div>
          {error && <p className="text-sm text-red-700">{error.message}</p>}
        </form>
      </Modal>
    </>
  );
}

export function AnnouncementList({
  items,
  canManage,
  empty,
}: {
  items: AnnouncementItem[];
  canManage?: boolean;
  empty?: string;
}) {
  if (!items.length)
    return <p className="py-6 text-center text-sm text-slate-500">{empty ?? 'No announcements yet.'}</p>;
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <AnnouncementCard key={a.id} a={a} canManage={canManage} />
      ))}
    </div>
  );
}

export function AudienceBadge({ label }: { label: string }) {
  return <Badge tone="blue">{label}</Badge>;
}
