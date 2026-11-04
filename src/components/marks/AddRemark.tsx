'use client';

import { MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Button, Field, Input, Textarea } from '@/components/ui';

export function AddRemarkButton({ studentId, name, autoApproved }: { studentId: string; name: string; autoApproved: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const { run, busy } = useAction();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" /> Add remark
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remark for ${name}`}
        description={autoApproved ? 'Visible to the student straight away.' : 'The Class Incharge reviews remarks before the student sees them.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || text.trim().length < 2}
              onClick={async () => {
                if (await run('/remarks', { body: { studentId, text, subjectName: subject || undefined } }, 'Remark added')) {
                  setOpen(false);
                  setText('');
                }
              }}
            >
              Add remark
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Subject (optional)" htmlFor="rm-sub">
            <Input id="rm-sub" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Mathematics" />
          </Field>
          <Field label="Remark" htmlFor="rm-text">
            <Textarea id="rm-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Works hard and helps classmates." />
          </Field>
        </div>
      </Modal>
    </>
  );
}
