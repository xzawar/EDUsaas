'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Alert, Button, Field, Input, Select } from '@/components/ui';

export type TeachOption = { sectionId: string; section: string; subjectId: string; subject: string };

export function NewTestButton({ options, today }: { options: TeachOption[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(options[0] ? `${options[0].sectionId}:${options[0].subjectId}` : '');
  const [v, setV] = useState({ name: '', maxMarks: '25', heldOn: today });
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const [sectionId, subjectId] = pick.split(':');
    const r = await run<{ assessment: { id: string } }>(
      '/assessments',
      { body: { sectionId, subjectId, name: v.name, maxMarks: Number(v.maxMarks), heldOn: v.heldOn } },
      'Test created',
    );
    if (r) router.push(`/staff/assessments/${r.assessment.id}`);
  }
  if (!options.length) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New test
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New test"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !v.name.trim() || !pick} onClick={submit}>
              Create & enter marks
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          {error && !Object.keys(errors).length && <Alert>{error.message}</Alert>}
          <Field label="Class and subject" htmlFor="t-pick">
            <Select id="t-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              {options.map((o) => (
                <option key={`${o.sectionId}:${o.subjectId}`} value={`${o.sectionId}:${o.subjectId}`}>
                  {o.section} · {o.subject}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Test name" htmlFor="t-name">
            <Input
              id="t-name"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="e.g. Unit Test 2, Mid-term"
            />
            <FieldError message={errors.name} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total marks" htmlFor="t-max">
              <Input
                id="t-max"
                type="number"
                min={1}
                max={1000}
                value={v.maxMarks}
                onChange={(e) => setV({ ...v, maxMarks: e.target.value })}
              />
            </Field>
            <Field label="Held on" htmlFor="t-date">
              <Input
                id="t-date"
                type="date"
                value={v.heldOn}
                onChange={(e) => setV({ ...v, heldOn: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
