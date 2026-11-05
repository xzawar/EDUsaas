'use client';

import { KeyRound, UserPlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ConfirmButton, FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { CredentialsDialog, type Credentials } from '@/components/people/CredentialsDialog';
import { Alert, Button, Field, Input, cx } from '@/components/ui';

type TeacherValues = {
  displayName: string;
  employeeNo: string;
  phone: string;
  qualification: string;
  joinedOn: string;
};
const EMPTY: TeacherValues = { displayName: '', employeeNo: '', phone: '', qualification: '', joinedOn: '' };
const toBody = (v: TeacherValues) => ({
  displayName: v.displayName.trim(),
  employeeNo: v.employeeNo.trim() || null,
  phone: v.phone.trim() || null,
  qualification: v.qualification.trim() || null,
  joinedOn: v.joinedOn || null,
});

function TeacherFields({
  v,
  set,
  errors,
}: {
  v: TeacherValues;
  set: (k: keyof TeacherValues, val: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Full name" htmlFor="t-name" hint="The username is generated from this, e.g. bss-t-alikhan-1.">
          <Input id="t-name" value={v.displayName} onChange={(e) => set('displayName', e.target.value)} required />
          <FieldError message={errors.displayName} />
        </Field>
      </div>
      <Field label="Employee no." htmlFor="t-emp">
        <Input id="t-emp" value={v.employeeNo} onChange={(e) => set('employeeNo', e.target.value)} />
        <FieldError message={errors.employeeNo} />
      </Field>
      <Field label="Phone" htmlFor="t-phone">
        <Input id="t-phone" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />
        <FieldError message={errors.phone} />
      </Field>
      <Field label="Qualification" htmlFor="t-qual">
        <Input
          id="t-qual"
          value={v.qualification}
          onChange={(e) => set('qualification', e.target.value)}
          placeholder="e.g. M.Sc Mathematics"
        />
      </Field>
      <Field label="Joined on" htmlFor="t-joined">
        <Input id="t-joined" type="date" value={v.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} />
      </Field>
    </div>
  );
}

export function NewTeacherButton({ schoolName }: { schoolName: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const { run, busy, error, clearError } = useAction();
  const errors = fieldErrors(error);

  useEffect(() => {
    if (params.get('new') === '1') {
      setOpen(true);
      router.replace('/staff/teachers');
    }
  }, [params, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run<{ id: string; name: string; username: string; temporaryPassword: string }>(
      '/teachers',
      { body: toBody(v) },
      'Teacher added',
    );
    if (!r) return;
    setOpen(false);
    setV(EMPTY);
    setCreds({
      name: r.name,
      username: r.username,
      temporaryPassword: r.temporaryPassword,
      detail: 'Teacher',
      portal: 'staff',
    });
  }

  return (
    <>
      <Button onClick={() => (clearError(), setOpen(true))}>
        <UserPlus className="size-4" /> Add teacher
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a teacher"
        description="Creates a staff-portal login. Assign sections and subjects on the next screen."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !v.displayName.trim()} onClick={submit}>
              {busy ? 'Adding…' : 'Add teacher'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          {error && !Object.keys(errors).length && (
            <div className="mb-4">
              <Alert>{error.message}</Alert>
            </div>
          )}
          <TeacherFields v={v} set={(k, val) => setV((s) => ({ ...s, [k]: val }))} errors={errors} />
        </form>
      </Modal>
      <CredentialsDialog
        creds={creds}
        schoolName={schoolName}
        onClose={() => {
          setCreds(null);
        }}
      />
    </>
  );
}

export function EditTeacherButton({ id, initial }: { id: string; initial: TeacherValues }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run(`/teachers/${id}`, { method: 'PATCH', body: toBody(v) }, 'Teacher updated')) setOpen(false);
  }
  return (
    <>
      <Button variant="secondary" onClick={() => (setV(initial), setOpen(true))}>
        Edit details
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit teacher"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <TeacherFields v={v} set={(k, val) => setV((s) => ({ ...s, [k]: val }))} errors={errors} />
        </form>
      </Modal>
    </>
  );
}

/** Reset password + enable/disable for a staff user (teachers, principal, admissions). */
export function AccountActions({
  userId,
  name,
  status,
  schoolName,
  portal = 'staff',
}: {
  userId: string;
  name: string;
  status: string;
  schoolName: string;
  portal?: 'staff' | 'student';
}) {
  const { run } = useAction();
  const [creds, setCreds] = useState<Credentials | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton
        label={
          <>
            <KeyRound className="size-4" /> Reset password
          </>
        }
        title={`Reset ${name}'s password?`}
        message={
          <p>
            A temporary password is issued and {name} is signed out on every device. They must choose a new password at
            next sign-in.
          </p>
        }
        confirmLabel="Reset password"
        tone="primary"
        onConfirm={async () => {
          const r = await run<{ username: string; displayName: string; temporaryPassword: string }>(
            `/users/${userId}/reset-password`,
            { method: 'POST' },
            'Password reset',
          );
          if (r)
            setCreds({ name: r.displayName, username: r.username, temporaryPassword: r.temporaryPassword, portal });
        }}
      />
      {status === 'ACTIVE' ? (
        <ConfirmButton
          variant="danger-ghost"
          label="Disable login"
          title={`Disable ${name}'s login?`}
          message={
            <p>
              {name} is signed out immediately and can’t sign in until you enable the account again. Nothing else is
              deleted.
            </p>
          }
          confirmLabel="Disable login"
          onConfirm={() =>
            run(`/users/${userId}/status`, { method: 'PATCH', body: { status: 'DISABLED' } }, 'Login disabled')
          }
        />
      ) : (
        <Button
          variant="secondary"
          onClick={() =>
            run(`/users/${userId}/status`, { method: 'PATCH', body: { status: 'ACTIVE' } }, 'Login enabled')
          }
        >
          Enable login
        </Button>
      )}
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} schoolName={schoolName} />
    </div>
  );
}

type SectionOption = { id: string; label: string; className: string; subjects: { id: string; name: string }[] };

/** Section × subject checkbox grid for one teacher (spec §5.2: the source of every teacher scope). */
export function AssignmentsEditor({
  teacherId,
  yearId,
  sections,
  initial,
}: {
  teacherId: string;
  yearId: string;
  sections: SectionOption[];
  initial: { sectionId: string; subjectId: string }[];
}) {
  const key = (s: string, j: string) => `${s}:${j}`;
  const [selected, setSelected] = useState(() => new Set(initial.map((a) => key(a.sectionId, a.subjectId))));
  const { run, busy } = useAction();
  const initialSet = useMemo(() => new Set(initial.map((a) => key(a.sectionId, a.subjectId))), [initial]);
  const dirty = selected.size !== initialSet.size || [...selected].some((k) => !initialSet.has(k));
  const byClass = useMemo(() => {
    const m = new Map<string, SectionOption[]>();
    for (const s of sections) m.set(s.className, [...(m.get(s.className) ?? []), s]);
    return [...m.entries()];
  }, [sections]);

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function save() {
    const assignments = [...selected].map((k) => {
      const [sectionId, subjectId] = k.split(':') as [string, string];
      return { sectionId, subjectId };
    });
    await run(
      `/teachers/${teacherId}/assignments`,
      { method: 'PUT', body: { academicYearId: yearId, assignments } },
      'Assignments saved',
    );
  }

  if (!sections.length)
    return <p className="text-sm text-slate-600">Create classes and sections for the current year first.</p>;

  return (
    <div>
      <div className="space-y-5">
        {byClass.map(([className, secs]) => (
          <div key={className}>
            <p className="mb-2 text-sm font-semibold text-slate-700">Class {className}</p>
            <div className="space-y-2">
              {secs.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="w-14 shrink-0 text-sm font-medium">{s.label}</span>
                  {s.subjects.length === 0 && (
                    <span className="text-xs text-slate-500">No subjects set for this class</span>
                  )}
                  {s.subjects.map((sub) => {
                    const k = key(s.id, sub.id);
                    const on = selected.has(k);
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(k)}
                        className={cx(
                          'rounded-full border px-3 py-1 text-xs font-medium transition',
                          on
                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400',
                        )}
                      >
                        {sub.name}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 mt-4 flex items-center justify-between gap-3 border-t border-slate-100 bg-white py-3">
        <span className="text-sm text-slate-600">
          {selected.size} assignment{selected.size === 1 ? '' : 's'} selected
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!dirty || busy} onClick={() => setSelected(new Set(initialSet))}>
            Reset
          </Button>
          <Button disabled={!dirty || busy} onClick={save}>
            {busy ? 'Saving…' : 'Save assignments'}
          </Button>
        </div>
      </div>
    </div>
  );
}
