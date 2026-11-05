'use client';

import { UserPlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Drawer, FieldError, fieldErrors, useAction } from '@/components/overlay';
import { CredentialsDialog, type Credentials } from '@/components/people/CredentialsDialog';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';

export type StudentFormValues = {
  displayName: string;
  sectionId: string;
  admissionNo: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth: string;
  admittedOn: string;
  guardianName: string;
  guardianPhone: string;
  address: string;
};

const EMPTY: StudentFormValues = {
  displayName: '',
  sectionId: '',
  admissionNo: '',
  gender: '',
  dateOfBirth: '',
  admittedOn: '',
  guardianName: '',
  guardianPhone: '',
  address: '',
};

function payload(v: StudentFormValues, includeSection: boolean, includeGuardian: boolean) {
  const nul = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    displayName: v.displayName.trim(),
    ...(includeSection ? { sectionId: v.sectionId } : {}),
    admissionNo: nul(v.admissionNo),
    gender: v.gender || null,
    dateOfBirth: nul(v.dateOfBirth),
    ...(v.admittedOn ? { admittedOn: v.admittedOn } : {}),
    ...(includeGuardian ? { guardianName: nul(v.guardianName), guardianPhone: nul(v.guardianPhone) } : {}),
    address: nul(v.address),
  };
}

function Fields({
  v,
  set,
  errors,
  sections,
  showSection,
  guardianEditable,
}: {
  v: StudentFormValues;
  set: <K extends keyof StudentFormValues>(k: K, val: StudentFormValues[K]) => void;
  errors: Record<string, string>;
  sections: { id: string; label: string; studentCount: number; capacity: number | null }[];
  showSection: boolean;
  guardianEditable: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field label="Full name" htmlFor="displayName">
        <Input
          id="displayName"
          value={v.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          required
          autoComplete="off"
        />
        <FieldError message={errors.displayName} />
      </Field>
      {showSection && (
        <Field
          label="Class & section"
          htmlFor="sectionId"
          hint="The next roll number in this section is assigned automatically."
        >
          <Select id="sectionId" value={v.sectionId} onChange={(e) => set('sectionId', e.target.value)} required>
            <option value="">Choose a section…</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {s.studentCount}
                {s.capacity ? `/${s.capacity}` : ''} students
              </option>
            ))}
          </Select>
          <FieldError message={errors.sectionId} />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Admission no." htmlFor="admissionNo">
          <Input id="admissionNo" value={v.admissionNo} onChange={(e) => set('admissionNo', e.target.value)} />
          <FieldError message={errors.admissionNo} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select
            id="gender"
            value={v.gender}
            onChange={(e) => set('gender', e.target.value as StudentFormValues['gender'])}
          >
            <option value="">—</option>
            <option value="FEMALE">Female</option>
            <option value="MALE">Male</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth">
          <Input
            id="dateOfBirth"
            type="date"
            value={v.dateOfBirth}
            onChange={(e) => set('dateOfBirth', e.target.value)}
          />
          <FieldError message={errors.dateOfBirth} />
        </Field>
        <Field label="Admitted on" htmlFor="admittedOn">
          <Input id="admittedOn" type="date" value={v.admittedOn} onChange={(e) => set('admittedOn', e.target.value)} />
        </Field>
      </div>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">Guardian</legend>
        {!guardianEditable && (
          <p className="text-xs text-slate-500">Only the School Admin can change guardian details.</p>
        )}
        <Field label="Guardian name" htmlFor="guardianName">
          <Input
            id="guardianName"
            value={v.guardianName}
            onChange={(e) => set('guardianName', e.target.value)}
            disabled={!guardianEditable}
          />
        </Field>
        <Field label="Guardian phone" htmlFor="guardianPhone" hint="For reference only; no SMS is sent.">
          <Input
            id="guardianPhone"
            type="tel"
            inputMode="tel"
            value={v.guardianPhone}
            onChange={(e) => set('guardianPhone', e.target.value)}
            disabled={!guardianEditable}
            placeholder="0300 1234567"
          />
          <FieldError message={errors.guardianPhone} />
        </Field>
      </fieldset>
      <Field label="Address" htmlFor="address">
        <Textarea id="address" rows={2} value={v.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
    </div>
  );
}

/** "Admit student" button + drawer. Opens automatically with ?new=1. */
export function NewStudentButton({
  sections,
  schoolName,
  defaultSectionId,
}: {
  sections: { id: string; label: string; studentCount: number; capacity: number | null }[];
  schoolName: string;
  defaultSectionId?: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<StudentFormValues>({ ...EMPTY, sectionId: defaultSectionId ?? '' });
  const [creds, setCreds] = useState<Credentials | null>(null);
  const { run, busy, error, clearError } = useAction();
  const errors = fieldErrors(error);
  const set: Parameters<typeof Fields>[0]['set'] = (k, val) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (params.get('new') === '1') {
      setOpen(true);
      const p = new URLSearchParams(params.toString());
      p.delete('new');
      router.replace(`?${p.toString()}`);
    }
  }, [params, router]);

  async function submit(e: FormEvent, again: boolean) {
    e.preventDefault();
    const res = await run<{
      id: string;
      name: string;
      username: string;
      rollNumber: number;
      section: string;
      temporaryPassword: string;
    }>('/students', { body: payload(v, true, true) }, 'Student admitted');
    if (!res) return;
    setCreds({
      name: res.name,
      username: res.username,
      temporaryPassword: res.temporaryPassword,
      detail: `${res.section} · Roll no. ${res.rollNumber}`,
      portal: 'student',
    });
    setV({ ...EMPTY, sectionId: v.sectionId });
    if (!again) setOpen(false);
  }

  return (
    <>
      <Button onClick={() => (clearError(), setOpen(true))}>
        <UserPlus className="size-4" /> Admit student
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Admit a student"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={(e) => submit(e, true)}>
              Save & add another
            </Button>
            <Button disabled={busy || !v.displayName || !v.sectionId} onClick={(e) => submit(e, false)}>
              {busy ? 'Saving…' : 'Admit student'}
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => submit(e, false)}>
          {error && !Object.keys(errors).length && (
            <div className="mb-4">
              <Alert>{error.message}</Alert>
            </div>
          )}
          <Fields v={v} set={set} errors={errors} sections={sections} showSection guardianEditable />
        </form>
      </Drawer>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} schoolName={schoolName} />
    </>
  );
}

export function EditStudentButton({
  id,
  initial,
  guardianEditable,
}: {
  id: string;
  initial: StudentFormValues;
  guardianEditable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  const set: Parameters<typeof Fields>[0]['set'] = (k, val) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = payload(v, false, guardianEditable);
    // Only send what changed, so audit logs show exactly what was edited.
    const before = payload(initial, false, guardianEditable) as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(body).filter(([k, val]) => before[k] !== val));
    if (!Object.keys(changed).length) return setOpen(false);
    if (await run(`/students/${id}`, { method: 'PATCH', body: changed }, 'Changes saved')) setOpen(false);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => (setV(initial), setOpen(true))}>
        Edit details
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Edit student"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Save changes'}
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
          <Fields
            v={v}
            set={set}
            errors={errors}
            sections={[]}
            showSection={false}
            guardianEditable={guardianEditable}
          />
        </form>
      </Drawer>
    </>
  );
}
