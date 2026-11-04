'use client';

import { ArrowRightLeft, KeyRound, RotateCcw, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { ConfirmButton, Modal, useAction } from '@/components/overlay';
import { CredentialsDialog, type Credentials } from '@/components/people/CredentialsDialog';
import { Button, Field, Select } from '@/components/ui';

export function StudentActions({
  student,
  sections,
  can,
  schoolName,
}: {
  student: {
    id: string;
    name: string;
    status: string;
    canRestore: boolean;
    sectionId: string | null;
    sectionLabel: string | null;
  };
  sections: { id: string; label: string; studentCount: number; capacity: number | null }[];
  can: { write: boolean; reset: boolean };
  schoolName: string;
}) {
  const { run } = useAction();
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const active = student.status === 'ACTIVE';

  return (
    <div className="flex flex-wrap gap-2">
      {can.write && active && (
        <Button variant="secondary" onClick={() => (setTarget(''), setTransferOpen(true))}>
          <ArrowRightLeft className="size-4" /> Transfer
        </Button>
      )}
      {can.reset && active && (
        <ConfirmButton
          label={
            <>
              <KeyRound className="size-4" /> Reset password
            </>
          }
          title={`Reset ${student.name}'s password?`}
          message={
            <p>
              A new temporary password will be created and the student will be signed out on every device. They must
              choose a new password at their next sign-in.
            </p>
          }
          confirmLabel="Reset password"
          tone="primary"
          onConfirm={async () => {
            const r = await run<{ username: string; displayName: string; temporaryPassword: string }>(
              `/students/${student.id}/reset-password`,
              { method: 'POST' },
              'Password reset',
            );
            if (r)
              setCreds({
                name: r.displayName,
                username: r.username,
                temporaryPassword: r.temporaryPassword,
                detail: student.sectionLabel ?? undefined,
                portal: 'student',
              });
          }}
        />
      )}
      {can.write && active && (
        <ConfirmButton
          variant="danger-ghost"
          label={
            <>
              <UserMinus className="size-4" /> Withdraw
            </>
          }
          title={`Withdraw ${student.name}?`}
          message={
            <>
              <p>The student will be removed from class lists and signed out. Their login stops working.</p>
              <p>You can restore them within 30 days. Their roll number is kept and not reused.</p>
            </>
          }
          confirmLabel="Withdraw student"
          onConfirm={() => run(`/students/${student.id}/withdraw`, { method: 'POST' }, 'Student withdrawn')}
        />
      )}
      {can.write && student.canRestore && (
        <ConfirmButton
          label={
            <>
              <RotateCcw className="size-4" /> Restore
            </>
          }
          title={`Restore ${student.name}?`}
          message={
            <p>The student returns to their section with the same roll number and username, and can sign in again.</p>
          }
          confirmLabel="Restore student"
          tone="primary"
          onConfirm={() => run(`/students/${student.id}/restore`, { method: 'POST' }, 'Student restored')}
        />
      )}

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={`Transfer ${student.name}`}
        description={`Currently in ${student.sectionLabel ?? 'no section'}. The student gets the next roll number in the new section, and their username changes.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!target || busy}
              onClick={async () => {
                setBusy(true);
                const r = await run<{ username: string; section: string }>(
                  `/students/${student.id}/transfer`,
                  { body: { sectionId: target } },
                  'Student transferred',
                );
                setBusy(false);
                if (r) setTransferOpen(false);
              }}
            >
              {busy ? 'Transferring…' : 'Transfer'}
            </Button>
          </>
        }
      >
        <Field label="New section" htmlFor="transfer-target">
          <Select id="transfer-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {sections
              .filter((s) => s.id !== student.sectionId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.studentCount}
                  {s.capacity ? `/${s.capacity}` : ''}
                </option>
              ))}
          </Select>
        </Field>
      </Modal>
      <CredentialsDialog creds={creds} onClose={() => setCreds(null)} schoolName={schoolName} />
    </div>
  );
}
