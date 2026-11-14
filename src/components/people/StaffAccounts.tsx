'use client';

import { UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { CredentialsDialog, type Credentials } from '@/components/people/CredentialsDialog';
import { AccountActions } from '@/components/people/TeacherForms';
import { Button, Field, Input, Select } from '@/components/ui';

export function NewStaffButton({ schoolName }: { schoolName: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ role: 'PRINCIPAL', displayName: '', email: '' });
  const [creds, setCreds] = useState<Credentials | null>(null);
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await run<{ email: string; temporaryPassword: string }>('/staff', { body: v }, 'Account created');
    if (!r) return;
    setOpen(false);
    setCreds({
      name: v.displayName,
      username: r.email,
      temporaryPassword: r.temporaryPassword,
      detail: v.role === 'PRINCIPAL' ? 'Principal' : 'Admissions Officer',
      portal: 'staff',
    });
    setV({ role: 'PRINCIPAL', displayName: '', email: '' });
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Add office staff
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a Principal or Admissions Officer"
        description="They sign in on the Staff Portal with their email. Teachers are added on the Teachers page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !v.displayName || !v.email} onClick={submit}>
              Create account
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Role" htmlFor="st-role">
            <Select id="st-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
              <option value="PRINCIPAL">Principal</option>
              <option value="ADMISSIONS_OFFICER">Admissions Officer</option>
              <option value="ACCOUNTANT">Accountant</option>
            </Select>
          </Field>
          <Field label="Full name" htmlFor="st-name">
            <Input id="st-name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
            <FieldError message={errors.displayName} />
          </Field>
          <Field label="Email" htmlFor="st-email">
            <Input id="st-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            <FieldError message={errors.email} />
          </Field>
        </form>
      </Modal>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} schoolName={schoolName} />
    </>
  );
}

export { AccountActions };
