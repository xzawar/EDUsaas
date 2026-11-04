'use client';

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Printer, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { api } from '@/client/api';
import { useToast } from '@/components/overlay';
import { Alert, Badge, Button, ButtonLink, Card, Table, Td, Th, cx } from '@/components/ui';

type Preview = {
  id: string;
  status: string;
  fileName: string;
  total: number;
  valid: number;
  errors: { row: number; column: string; message: string }[];
  warnings: string[];
  bySection: { section: string; count: number }[];
  sample: { row: number; name: string; section: string; admissionNo: string | null }[];
  done: number;
  created: number;
};
type Cred = { name: string; username: string; temporaryPassword: string; section: string; rollNumber: number };
type Commit = Preview & { finished: boolean; credentials: Cred[] };

const MAX_BYTES = 2 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function credentialsCsv(creds: Cred[]) {
  const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const q = (v: string | number) => {
    const s = safe(String(v));
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [
    ['Name', 'Section', 'Roll', 'Username', 'Temporary password'],
    ...creds.map((c) => [c.name, c.section, c.rollNumber, c.username, c.temporaryPassword]),
  ];
  return '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span
        className={cx(
          'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold',
          done ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--accent)]/10 text-[var(--accent)]',
        )}
      >
        {done ? <CheckCircle2 className="size-5" /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-2">
        <p className="font-semibold">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

export function ImportWizard({ schoolName }: { schoolName: string }) {
  const router = useRouter();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [finished, setFinished] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    setPreview(null);
    setCreds([]);
    setFinished(false);
    if (file.size > MAX_BYTES) return setError('The file is larger than 2 MB. Split it into smaller files.');
    if (!/\.(xlsx|csv)$/i.test(file.name))
      return setError('Upload an Excel (.xlsx) or CSV file. Use the template above.');
    setBusy(true);
    const data = await toBase64(file);
    const r = await api<{ import: Preview }>('/imports/students', {
      body: { fileName: file.name, data, clientKey: crypto.randomUUID() },
    });
    setBusy(false);
    if (r.ok) setPreview(r.data.import);
    else setError(r.error.message);
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    setProgress({ done: preview.done, total: preview.valid });
    const all: Cred[] = [...creds];
    for (let guard = 0; guard < 100; guard++) {
      const r = await api<Commit>(`/imports/${preview.id}/commit`, { method: 'POST', body: {} });
      if (!r.ok) {
        setError(`${r.error.message} — ${all.length} students were added. Press “Continue import” to add the rest.`);
        break;
      }
      all.push(...r.data.credentials);
      setCreds([...all]);
      setProgress({ done: r.data.done, total: r.data.valid });
      if (r.data.finished) {
        setFinished(true);
        toast('success', `${r.data.created} students added`);
        router.refresh();
        break;
      }
    }
    setBusy(false);
  }

  const downloadCsv = () => {
    const blob = new Blob([credentialsCsv(creds)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `student-logins-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';

  if (finished) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          <strong>{creds.length} students added.</strong> Each one must choose a new password the first time they sign
          in.
        </Alert>
        <Card
          title="Logins for the new students"
          description="Passwords are shown only now. Download or print them before leaving this page."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="size-4" /> Print slips
              </Button>
              <Button onClick={downloadCsv}>
                <Download className="size-4" /> Download logins (CSV)
              </Button>
            </div>
          }
        >
          <Table>
            <thead>
              <tr>
                <Th>Student</Th>
                <Th>Section</Th>
                <Th>Username</Th>
                <Th>Temporary password</Th>
              </tr>
            </thead>
            <tbody>
              {creds.slice(0, 15).map((c) => (
                <tr key={c.username}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td>
                    {c.section} · Roll {c.rollNumber}
                  </Td>
                  <Td className="font-mono text-xs">{c.username}</Td>
                  <Td className="font-mono text-xs">{c.temporaryPassword}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {creds.length > 15 && (
            <p className="mt-3 text-sm text-slate-500">…and {creds.length - 15} more in the download.</p>
          )}
          <div className="flex gap-2 pt-4">
            <ButtonLink href="/staff/students" variant="secondary">
              Go to students
            </ButtonLink>
          </div>
        </Card>
        {/* Printable slips: 2 per row, never split across pages. */}
        <div className="print-area hidden print:grid print:grid-cols-2 print:gap-4">
          {creds.map((c) => (
            <div
              key={c.username}
              className="break-inside-avoid rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm"
            >
              <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase">{schoolName}</p>
              <p className="mt-1 font-semibold">{c.name}</p>
              <p className="text-xs text-slate-600">
                {c.section} · Roll {c.rollNumber}
              </p>
              <p className="mt-2 text-xs text-slate-500">Sign in at {loginUrl}</p>
              <p className="font-mono">Username: {c.username}</p>
              <p className="font-mono">Password: {c.temporaryPassword}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <div className="space-y-6">
        <Step n={1} title="Download the template">
          <p className="mb-3 text-sm text-slate-600">
            One student per row: name, class and section. Everything else is optional.
          </p>
          <a
            download
            href="/api/v1/imports/students/template"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            <FileSpreadsheet className="size-4 text-emerald-600" /> Excel template (.xlsx)
          </a>
        </Step>

        <Step n={2} title="Upload your file" done={!!preview}>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void upload(f);
            }}
            className={cx(
              'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition',
              dragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-slate-300 hover:border-slate-400',
            )}
          >
            <Upload className="size-6 text-slate-400" />
            <span className="text-sm font-medium">
              {busy && !preview ? 'Checking your file…' : 'Drop the file here, or click to choose'}
            </span>
            <span className="text-xs text-slate-500">.xlsx or .csv · up to 2,000 students · max 2 MB</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="sr-only"
              aria-label="Choose a file to import"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
          </label>
          {error && !preview && (
            <div className="mt-3">
              <Alert tone="error">{error}</Alert>
            </div>
          )}
        </Step>

        <Step n={3} title="Check and import">
          {!preview ? (
            <p className="text-sm text-slate-500">You’ll see a preview here before anything is saved.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">Rows in file</p>
                  <p className="text-xl font-semibold tabular-nums">{preview.total}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-800">Ready to import</p>
                  <p className="text-xl font-semibold text-emerald-900 tabular-nums">{preview.valid}</p>
                </div>
                <div
                  className={cx(
                    'rounded-lg border p-3',
                    preview.errors.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200',
                  )}
                >
                  <p className="text-xs text-slate-600">Need fixing</p>
                  <p className="text-xl font-semibold tabular-nums">{preview.total - preview.valid}</p>
                </div>
              </div>

              {preview.bySection.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.bySection.map((s) => (
                    <Badge key={s.section}>
                      {s.section}: {s.count}
                    </Badge>
                  ))}
                </div>
              )}
              {preview.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  <AlertTriangle className="mr-1 inline size-4" aria-hidden /> {w}
                </Alert>
              ))}

              {preview.errors.length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-slate-700">
                    These rows will be skipped. Fix them in your file and upload it again, or import the ready rows now.
                  </p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 px-5">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Row</Th>
                          <Th>Column</Th>
                          <Th>Problem</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.map((e, i) => (
                          <tr key={i}>
                            <Td className="tabular-nums">{e.row}</Td>
                            <Td>{e.column}</Td>
                            <Td className="text-amber-800">{e.message}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}

              {progress && busy && (
                <div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={progress.done}
                    aria-valuemax={progress.total}
                    aria-label="Import progress"
                  >
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Adding students… {progress.done} of {progress.total}
                  </p>
                </div>
              )}
              {error && <Alert tone="error">{error}</Alert>}

              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || preview.valid === 0} onClick={commit}>
                  {busy
                    ? 'Importing…'
                    : creds.length
                      ? 'Continue import'
                      : `Import ${preview.valid} student${preview.valid === 1 ? '' : 's'}`}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  Choose another file
                </Button>
              </div>
            </div>
          )}
        </Step>
      </div>
    </Card>
  );
}
