'use client';

import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FieldError, Modal, fieldErrors, useAction } from '@/components/overlay';
import { Badge, Button, EmptyState, Field, Input, Table, Td, Th } from '@/components/ui';

type Subject = {
  id: string;
  name: string;
  code: string | null;
  archived: boolean;
  classCount: number;
  teacherCount: number;
};

export function SubjectsManager({ subjects }: { subjects: Subject[] }) {
  const [editing, setEditing] = useState<Subject | 'new' | null>(null);
  const { run } = useAction();
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Add subject
        </Button>
      </div>
      {subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          description="Add the subjects your school teaches, e.g. English, Urdu, Mathematics."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th>Code</Th>
              <Th className="text-right">Classes</Th>
              <Th className="text-right">Teacher assignments</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id} className={s.archived ? 'opacity-60' : ''}>
                <Td className="font-medium">
                  {s.name} {s.archived && <Badge>Archived</Badge>}
                </Td>
                <Td className="font-mono text-xs text-slate-600">{s.code ?? '—'}</Td>
                <Td className="text-right tabular-nums">{s.classCount}</Td>
                <Td className="text-right tabular-nums">{s.teacherCount}</Td>
                <Td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      run(
                        `/subjects/${s.id}`,
                        { method: 'PATCH', body: { archived: !s.archived } },
                        s.archived ? 'Subject restored' : 'Subject archived',
                      )
                    }
                  >
                    {s.archived ? 'Restore' : 'Archive'}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing && (
        <SubjectModal
          key={editing === 'new' ? 'new' : editing.id}
          subject={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function SubjectModal({ subject, onClose }: { subject: Subject | null; onClose: () => void }) {
  const [name, setName] = useState(subject?.name ?? '');
  const [code, setCode] = useState(subject?.code ?? '');
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name, code: code || null };
    const ok = subject
      ? await run(`/subjects/${subject.id}`, { method: 'PATCH', body }, 'Subject updated')
      : await run('/subjects', { body }, `${name} added`);
    if (ok) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={subject ? 'Edit subject' : 'Add subject'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Name" htmlFor="sub-name">
            <Input id="sub-name" value={name} onChange={(e) => setName(e.target.value)} />
            <FieldError message={errors.name} />
          </Field>
        </div>
        <Field label="Code" htmlFor="sub-code">
          <Input id="sub-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATH" />
        </Field>
      </form>
    </Modal>
  );
}
