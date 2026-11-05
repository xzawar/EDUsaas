'use client';

import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { Modal, useAction } from '@/components/overlay';
import { Button, Field, Input, Textarea } from '@/components/ui';

export function NewTicketButton() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '', body: '' });
  const { run, busy, error } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <LifeBuoy className="size-4" /> Ask EDUsaas for help
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ask EDUsaas for help"
        description="Our team replies here. We never look at your school’s data unless you approve a support request."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (await run('/support/tickets', { body: f }, 'Sent to EDUsaas support')) {
                  setOpen(false);
                  setF({ subject: '', body: '' });
                }
              }}
            >
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Subject" htmlFor="tk-subject">
            <Input
              id="tk-subject"
              maxLength={150}
              value={f.subject}
              onChange={(e) => setF({ ...f, subject: e.target.value })}
              placeholder="e.g. Attendance totals look wrong for 7-B"
            />
          </Field>
          <Field label="What happened?" htmlFor="tk-body">
            <Textarea
              id="tk-body"
              rows={5}
              maxLength={5000}
              value={f.body}
              onChange={(e) => setF({ ...f, body: e.target.value })}
            />
          </Field>
          {error && <p className="text-sm text-red-700">{error.message}</p>}
        </div>
      </Modal>
    </>
  );
}

export function CloseTicketButton({ id }: { id: string }) {
  const { run, busy } = useAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={() => run(`/support/tickets/${id}/close`, { method: 'POST' }, 'Ticket closed')}
    >
      Close ticket
    </Button>
  );
}
