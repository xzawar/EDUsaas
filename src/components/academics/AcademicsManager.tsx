'use client';

import { Copy, ListOrdered, MoreHorizontal, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/client/api';
import { ConfirmButton, FieldError, Modal, fieldErrors, useAction, useToast } from '@/components/overlay';
import { Meter } from '@/components/charts';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select, cx } from '@/components/ui';

type Subject = { id: string; name: string };
type SectionRow = {
  id: string;
  name: string;
  capacity: number | null;
  studentCount: number;
  classTeacher: { id: string; name: string } | null;
};
type ClassRow = { id: string; name: string; gradeLevel: number; subjects: Subject[]; sections: SectionRow[] };
type Year = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'PLANNED' | 'CURRENT' | 'CLOSED';
  classCount: number;
};

const GRADE_LABELS: Record<number, string> = { [-3]: 'Toddler', [-2]: 'Playgroup', [-1]: 'Nursery', 0: 'Prep / KG' };
const gradeLabel = (g: number) => GRADE_LABELS[g] ?? `Grade ${g}`;

export function AcademicsManager({
  years,
  year,
  classes,
  subjects,
  teachers,
}: {
  years: Year[];
  year: Year | null;
  classes: ClassRow[];
  subjects: Subject[];
  teachers: { id: string; name: string }[];
}) {
  const [newYear, setNewYear] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [classModal, setClassModal] = useState<ClassRow | 'new' | null>(null);
  const [subjectsFor, setSubjectsFor] = useState<ClassRow | null>(null);
  const [sectionModal, setSectionModal] = useState<{ classId: string; section?: SectionRow } | null>(null);
  const [renumberFor, setRenumberFor] = useState<(SectionRow & { label: string }) | null>(null);
  const { run } = useAction();
  const totalStudents = classes.reduce((n, c) => n + c.sections.reduce((m, s) => m + s.studentCount, 0), 0);

  return (
    <div className="space-y-6">
      {/* Year bar */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {years.map((y) => (
              <Link
                key={y.id}
                href={`/staff/academics?year=${y.id}`}
                className={cx(
                  'rounded-lg border px-3 py-1.5 text-sm font-medium',
                  y.id === year?.id
                    ? 'border-deep bg-tint text-link'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                )}
              >
                {y.name}
                {y.status === 'CURRENT' && <Star className="ml-1 inline size-3.5 fill-current" aria-label="current" />}
                {y.status === 'CLOSED' && <span className="ml-1 text-xs text-slate-400">closed</span>}
              </Link>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setNewYear(true)}>
              <Plus className="size-4" /> New year
            </Button>
          </div>
          {year && (
            <div className="flex flex-wrap gap-2">
              {year.status !== 'CURRENT' && (
                <ConfirmButton
                  size="sm"
                  label="Make current"
                  title={`Make ${year.name} the current year?`}
                  message={
                    <p>
                      Dashboards, admissions and teacher assignments will use {year.name}. The current year will be
                      closed.
                    </p>
                  }
                  confirmLabel="Make current"
                  tone="primary"
                  onConfirm={() =>
                    run(
                      `/academic-years/${year.id}`,
                      { method: 'PATCH', body: { status: 'CURRENT' } },
                      `${year.name} is now the current year`,
                    )
                  }
                />
              )}
              {years.length > 1 && (
                <Button variant="secondary" size="sm" onClick={() => setCopyOpen(true)}>
                  <Copy className="size-4" /> Copy structure
                </Button>
              )}
              <Button size="sm" onClick={() => setClassModal('new')}>
                <Plus className="size-4" /> Add class
              </Button>
            </div>
          )}
        </div>
        {year && (
          <p className="mt-3 text-sm text-slate-500">
            {new Date(year.startsOn).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} –{' '}
            {new Date(year.endsOn).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })} · {classes.length}{' '}
            classes · {classes.reduce((n, c) => n + c.sections.length, 0)} sections · {totalStudents} students
          </p>
        )}
      </Card>

      {!year ? (
        <Card>
          <EmptyState
            title="No academic year yet"
            description="Create your first academic year to add classes and sections."
            action={<Button onClick={() => setNewYear(true)}>Create academic year</Button>}
          />
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState
            title={`No classes in ${year.name}`}
            description={
              years.length > 1
                ? 'Add classes one by one, or copy the structure from another year.'
                : 'Add your first class and its sections.'
            }
            action={
              <div className="flex gap-2">
                <Button onClick={() => setClassModal('new')}>Add class</Button>
                {years.length > 1 && (
                  <Button variant="secondary" onClick={() => setCopyOpen(true)}>
                    Copy structure
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {classes.map((c) => (
            <Card
              key={c.id}
              title={
                <span className="flex items-center gap-2">
                  Class {c.name} <span className="text-xs font-normal text-slate-500">{gradeLabel(c.gradeLevel)}</span>
                </span>
              }
              actions={
                <ClassMenu
                  onRename={() => setClassModal(c)}
                  onSubjects={() => setSubjectsFor(c)}
                  onAddSection={() => setSectionModal({ classId: c.id })}
                  onDelete={() => run(`/classes/${c.id}`, { method: 'DELETE' }, `Class ${c.name} deleted`)}
                  deletable={c.sections.every((s) => s.studentCount === 0)}
                />
              }
            >
              <div className="mb-3 flex flex-wrap gap-1.5">
                {c.subjects.length ? (
                  c.subjects.map((s) => <Badge key={s.id}>{s.name}</Badge>)
                ) : (
                  <button
                    type="button"
                    onClick={() => setSubjectsFor(c)}
                    className="text-xs font-medium text-amber-700 hover:underline"
                  >
                    No subjects yet — add subjects
                  </button>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {c.sections.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <Link
                      href={`/staff/students?sectionId=${s.id}`}
                      className="w-16 shrink-0 font-semibold hover:text-deep-2"
                    >
                      {c.name}-{s.name}
                    </Link>
                    <div className="w-28 shrink-0">
                      <p className="text-xs text-slate-500">
                        {s.studentCount}
                        {s.capacity ? ` / ${s.capacity}` : ''} students
                      </p>
                      {s.capacity ? (
                        <Meter value={s.studentCount} max={s.capacity} label={`${c.name}-${s.name} fill`} />
                      ) : null}
                    </div>
                    <InchargePicker section={s} teachers={teachers} label={`${c.name}-${s.name}`} />
                    <div className="ml-auto flex gap-1">
                      <IconButton label="Edit section" onClick={() => setSectionModal({ classId: c.id, section: s })}>
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        label="Renumber roll numbers"
                        onClick={() => setRenumberFor({ ...s, label: `${c.name}-${s.name}` })}
                        disabled={s.studentCount === 0}
                      >
                        <ListOrdered className="size-4" />
                      </IconButton>
                      {s.studentCount === 0 && (
                        <IconButton
                          label="Delete section"
                          onClick={() =>
                            run(`/sections/${s.id}`, { method: 'DELETE' }, `Section ${c.name}-${s.name} deleted`)
                          }
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <NewYearModal open={newYear} onClose={() => setNewYear(false)} isFirst={years.length === 0} />
      {year && (
        <CopyModal
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          year={year}
          years={years.filter((y) => y.id !== year.id)}
        />
      )}
      {year && classModal && (
        <ClassModal
          key={classModal === 'new' ? 'new' : classModal.id}
          onClose={() => setClassModal(null)}
          yearId={year.id}
          existing={classModal === 'new' ? null : classModal}
          subjects={subjects}
        />
      )}
      {subjectsFor && (
        <SubjectsModal
          key={subjectsFor.id}
          cls={subjectsFor}
          subjects={subjects}
          onClose={() => setSubjectsFor(null)}
        />
      )}
      {sectionModal && (
        <SectionModal key={sectionModal.section?.id ?? 'new'} {...sectionModal} onClose={() => setSectionModal(null)} />
      )}
      {renumberFor && <RenumberModal key={renumberFor.id} section={renumberFor} onClose={() => setRenumberFor(null)} />}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ClassMenu({
  onRename,
  onSubjects,
  onAddSection,
  onDelete,
  deletable,
}: {
  onRename: () => void;
  onSubjects: () => void;
  onAddSection: () => void;
  onDelete: () => void;
  deletable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const item = 'block w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-slate-100';
  return (
    <div className="relative">
      <IconButton label="Class options" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-5" />
      </IconButton>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
            onClick={() => setOpen(false)}
          >
            <button type="button" className={item} onClick={onAddSection}>
              Add section
            </button>
            <button type="button" className={item} onClick={onSubjects}>
              Edit subjects
            </button>
            <button type="button" className={item} onClick={onRename}>
              Rename class
            </button>
            {deletable && (
              <button type="button" className={cx(item, 'text-red-700')} onClick={onDelete}>
                Delete class
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InchargePicker({
  section,
  teachers,
  label,
}: {
  section: SectionRow;
  teachers: { id: string; name: string }[];
  label: string;
}) {
  const { run, busy } = useAction();
  return (
    <label className="flex min-w-48 flex-1 items-center gap-2 text-sm">
      <span className="text-xs text-slate-500">Incharge</span>
      <Select
        aria-label={`Class Incharge for ${label}`}
        value={section.classTeacher?.id ?? ''}
        disabled={busy}
        onChange={(e) =>
          run(
            `/sections/${section.id}`,
            { method: 'PATCH', body: { classTeacherId: e.target.value || null } },
            `Class Incharge for ${label} updated`,
          )
        }
        className={cx('py-1.5', !section.classTeacher && 'border-amber-300 text-amber-800')}
      >
        <option value="">Not assigned</option>
        {teachers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </label>
  );
}

function NewYearModal({ open, onClose, isFirst }: { open: boolean; onClose: () => void; isFirst: boolean }) {
  const now = new Date();
  const y = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  const [v, setV] = useState({
    name: `${y}-${String((y + 1) % 100).padStart(2, '0')}`,
    startsOn: `${y}-04-01`,
    endsOn: `${y + 1}-03-31`,
    makeCurrent: isFirst,
  });
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (await run('/academic-years', { body: v }, `Academic year ${v.name} created`)) onClose();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New academic year"
      description="A default grading scale (A1 to F) is created with it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            Create year
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" htmlFor="y-name">
          <Input id="y-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <FieldError message={errors.name} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" htmlFor="y-start">
            <Input
              id="y-start"
              type="date"
              value={v.startsOn}
              onChange={(e) => setV({ ...v, startsOn: e.target.value })}
            />
          </Field>
          <Field label="Ends" htmlFor="y-end">
            <Input id="y-end" type="date" value={v.endsOn} onChange={(e) => setV({ ...v, endsOn: e.target.value })} />
            <FieldError message={errors.endsOn} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={v.makeCurrent}
            onChange={(e) => setV({ ...v, makeCurrent: e.target.checked })}
            className="size-4 accent-deep"
          />
          Make this the current year now
        </label>
      </form>
    </Modal>
  );
}

function CopyModal({ open, onClose, year, years }: { open: boolean; onClose: () => void; year: Year; years: Year[] }) {
  const [from, setFrom] = useState(years.find((y) => y.status === 'CURRENT')?.id ?? years[0]?.id ?? '');
  const [incharges, setIncharges] = useState(true);
  const { run, busy } = useAction();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Copy structure into ${year.name}`}
      description="Copies classes, sections and class subjects. Classes that already exist are skipped. Students are not copied; use Promotion for that."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!from || busy}
            onClick={async () => {
              const r = await run<{ classes: number; sections: number }>(`/academic-years/${year.id}/copy-structure`, {
                body: { fromYearId: from, copyIncharges: incharges },
              });
              if (r) onClose();
            }}
          >
            Copy
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Copy from" htmlFor="copy-from">
          <Select id="copy-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} ({y.classCount} classes)
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={incharges}
            onChange={(e) => setIncharges(e.target.checked)}
            className="size-4 accent-deep"
          />
          Keep the same Class Incharges
        </label>
      </div>
    </Modal>
  );
}

function SubjectPicker({
  subjects,
  selected,
  onChange,
}: {
  subjects: Subject[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  if (!subjects.length)
    return (
      <Alert tone="info">
        No subjects yet.{' '}
        <Link href="/staff/subjects" className="font-medium underline">
          Add subjects
        </Link>{' '}
        first.
      </Alert>
    );
  return (
    <div className="flex flex-wrap gap-2">
      {subjects.map((s) => {
        const on = selected.has(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const n = new Set(selected);
              if (on) n.delete(s.id);
              else n.add(s.id);
              onChange(n);
            }}
            className={cx(
              'rounded-full border px-3 py-1 text-sm',
              on ? 'border-deep bg-accent text-deep' : 'border-slate-300 text-slate-700 hover:border-slate-400',
            )}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

function ClassModal({
  onClose,
  yearId,
  existing,
  subjects,
}: {
  onClose: () => void;
  yearId: string;
  existing: ClassRow | null;
  subjects: Subject[];
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [grade, setGrade] = useState(existing?.gradeLevel ?? 1);
  const [sections, setSections] = useState('A, B');
  const [picked, setPicked] = useState(new Set(subjects.map((s) => s.id)));
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = existing
      ? await run(`/classes/${existing.id}`, { method: 'PATCH', body: { name, gradeLevel: grade } }, 'Class updated')
      : await run(
          '/classes',
          {
            body: {
              academicYearId: yearId,
              name,
              gradeLevel: grade,
              sections: sections.split(/[,\s]+/).filter(Boolean),
              subjectIds: [...picked],
            },
          },
          `Class ${name} created`,
        );
    if (ok) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      size={existing ? 'md' : 'lg'}
      title={existing ? `Rename class ${existing.name}` : 'Add a class'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={submit}>
            {existing ? 'Save' : 'Create class'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class name" htmlFor="c-name" hint="e.g. 8, Nursery, Prep">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <FieldError message={errors.name} />
          </Field>
          <Field label="Level" htmlFor="c-grade" hint="Used for ordering and promotion">
            <Select id="c-grade" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {Array.from({ length: 16 }, (_, i) => i - 2).map((g) => (
                <option key={g} value={g}>
                  {gradeLabel(g)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!existing && (
          <>
            <Field label="Sections" htmlFor="c-sections" hint="Separate with commas, e.g. A, B, C">
              <Input id="c-sections" value={sections} onChange={(e) => setSections(e.target.value)} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Subjects taught</p>
              <SubjectPicker subjects={subjects} selected={picked} onChange={setPicked} />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function SubjectsModal({ cls, subjects, onClose }: { cls: ClassRow; subjects: Subject[]; onClose: () => void }) {
  const [picked, setPicked] = useState(new Set(cls.subjects.map((s) => s.id)));
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Subjects for class ${cls.name}`}
      description="Teachers can only be assigned to subjects taught in the class."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () =>
              (await run(
                `/classes/${cls.id}/subjects`,
                { method: 'PUT', body: { subjectIds: [...picked] } },
                'Subjects saved',
              )) && onClose()
            }
          >
            Save subjects
          </Button>
        </>
      }
    >
      <SubjectPicker subjects={subjects} selected={picked} onChange={setPicked} />
    </Modal>
  );
}

function SectionModal({ classId, section, onClose }: { classId: string; section?: SectionRow; onClose: () => void }) {
  const [name, setName] = useState(section?.name ?? '');
  const [capacity, setCapacity] = useState(section?.capacity ? String(section.capacity) : '');
  const { run, busy, error } = useAction();
  const errors = fieldErrors(error);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = { name, capacity: capacity ? Number(capacity) : null };
    const ok = section
      ? await run(`/sections/${section.id}`, { method: 'PATCH', body }, 'Section updated')
      : await run('/sections', { body: { ...body, classId } }, `Section ${name.toUpperCase()} added`);
    if (ok) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={section ? `Edit section ${section.name}` : 'Add a section'}
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
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Field label="Section name" htmlFor="s-name">
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          <FieldError message={errors.name} />
        </Field>
        <Field label="Capacity (optional)" htmlFor="s-cap">
          <Input
            id="s-cap"
            type="number"
            min={1}
            max={200}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

type RenumberPreview = {
  section: string;
  total: number;
  changes: {
    studentId: string;
    name: string;
    oldRoll: number | null;
    newRoll: number;
    oldUsername: string | null;
    newUsername: string;
  }[];
};

/** Spec §3.3: resequence 1..n with mandatory confirmation showing how many usernames change. */
function RenumberModal({ section, onClose }: { section: SectionRow & { label: string }; onClose: () => void }) {
  const [preview, setPreview] = useState<RenumberPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const { run } = useAction();
  const toast = useToast();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<RenumberPreview>(`/sections/${section.id}/renumber`).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if (r.ok) setPreview(r.data);
      else toast('error', r.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [section.id, toast]);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Renumber roll numbers in ${section.label}`}
      description="Roll numbers become 1, 2, 3… in the current order, closing any gaps. Students are not notified."
    >
      {loading || !preview ? (
        <p className="text-sm text-slate-500">{loading ? 'Loading preview…' : 'Could not load the preview.'}</p>
      ) : preview.changes.length === 0 ? (
        <Alert tone="success">Roll numbers in {preview.section} are already sequential. Nothing to change.</Alert>
      ) : (
        <div className="space-y-4">
          <Alert tone="warning">
            <strong>{preview.changes.length}</strong> of {preview.total} students will get a new roll number{' '}
            <strong>and a new username</strong>. Their old username stops working immediately.
          </Alert>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Student</th>
                  <th className="px-3 py-2 text-left">Roll</th>
                  <th className="px-3 py-2 text-left">New username</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.changes.map((c) => (
                  <tr key={c.studentId}>
                    <td className="px-3 py-1.5">{c.name}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      {c.oldRoll} → <strong>{c.newRoll}</strong>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{c.newUsername}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <ConfirmButton
              label={`Renumber ${preview.changes.length} students`}
              variant="primary"
              title="Confirm renumbering"
              message={
                <p>
                  {preview.changes.length} usernames will change. Make sure you can tell those students their new
                  usernames.
                </p>
              }
              requireText="RENUMBER"
              confirmLabel="Renumber now"
              onConfirm={async () => {
                const r = await run(
                  `/sections/${section.id}/renumber`,
                  { body: { confirm: true, expectedChanges: preview.changes.length } },
                  'Roll numbers renumbered',
                );
                if (r) onClose();
              }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
