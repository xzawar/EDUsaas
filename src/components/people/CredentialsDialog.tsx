'use client';

import { Printer } from 'lucide-react';
import { Modal } from '@/components/overlay';
import { Button } from '@/components/ui';

export type Credentials = {
  name: string;
  username: string;
  temporaryPassword: string;
  detail?: string;
  portal: 'student' | 'staff';
};

/** One-time display of a new login (spec §9.3: forced change at first sign-in). Printable as a slip. */
export function CredentialsDialog({
  creds,
  onClose,
  schoolName,
}: {
  creds: Credentials | null;
  onClose: () => void;
  schoolName: string;
}) {
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}${creds?.portal === 'staff' ? '/staff/login' : '/login'}`
      : '';
  return (
    <Modal
      open={!!creds}
      onClose={onClose}
      title="Login created"
      description="This password is shown only once. Print the slip or copy it now."
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Print slip
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {creds && (
        <div className="print-area rounded-xl border-2 border-dashed border-slate-300 p-5">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">{schoolName}</p>
          <p className="mt-1 text-lg font-semibold">{creds.name}</p>
          {creds.detail && <p className="text-sm text-slate-600">{creds.detail}</p>}
          <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Sign in at</dt>
            <dd className="font-mono break-all">{url}</dd>
            <dt className="text-slate-500">Username</dt>
            <dd className="font-mono text-base font-semibold">{creds.username}</dd>
            <dt className="text-slate-500">Temporary password</dt>
            <dd className="font-mono text-base font-semibold">{creds.temporaryPassword}</dd>
          </dl>
          <p className="mt-4 text-xs text-slate-500">
            You will be asked to choose a new password the first time you sign in.
          </p>
        </div>
      )}
    </Modal>
  );
}
