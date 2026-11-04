import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { studentUsername } from '@/server/auth/username';
import { parseCsv } from '@/server/files/csv';
import { DEFAULT_LIMITS, SpreadsheetError, excelSerialToIso, readXlsx, writeXlsx } from '@/server/files/xlsx';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant, sectionLabel, toDate } from '@/server/school/common';
import { createLogin, placeInSection, tenantPrefix } from '@/server/school/people';

/**
 * Bulk student import (spec §8.8, §9.5): template → upload → preview with row errors → commit in chunks.
 * The preview is stored as a job; committing is idempotent and resumable (each call creates the next chunk and
 * records progress), so a retry never admits anyone twice. Temporary passwords are returned once and never stored.
 */

export const IMPORT_TYPE = 'student_import';
const CHUNK = 100;
const MAX_ROWS = 2000;

const COLUMNS = [
  { key: 'name', label: 'Student name', required: true, width: 28, hint: 'Full name, e.g. Ayesha Khan' },
  { key: 'class', label: 'Class', required: true, width: 10, hint: 'Exactly as in the system, e.g. 8 or Prep' },
  { key: 'section', label: 'Section', required: true, width: 10, hint: 'e.g. A' },
  { key: 'admissionNo', label: 'Admission no', required: false, width: 14, hint: 'Optional, must be unique' },
  { key: 'gender', label: 'Gender', required: false, width: 10, hint: 'Male, Female or Other' },
  { key: 'dateOfBirth', label: 'Date of birth', required: false, width: 14, hint: '2014-05-21 or 21/05/2014' },
  { key: 'guardianName', label: 'Guardian name', required: false, width: 24, hint: 'Optional' },
  { key: 'guardianPhone', label: 'Guardian phone', required: false, width: 16, hint: 'e.g. 0300 1234567' },
  { key: 'address', label: 'Address', required: false, width: 32, hint: 'Optional' },
] as const;
type Key = (typeof COLUMNS)[number]['key'];

export type ImportRow = {
  row: number;
  name: string;
  sectionId: string;
  section: string;
  admissionNo: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  address: string | null;
};
type RowError = { row: number; column: string; message: string };
type Payload = {
  fileName: string;
  clientKey: string;
  rows: ImportRow[];
  total: number;
  errors: RowError[];
  warnings: string[];
};
type Progress = { done: number; created: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Template workbook: a data sheet with the headers, and a help sheet listing this year's classes and sections. */
export async function importTemplate(ctx: AuthedContext) {
  const sections = await inTenant(ctx, (tx) =>
    tx.section.findMany({
      where: { class: { academicYear: { status: 'CURRENT' } } },
      include: { class: true },
      orderBy: [{ class: { gradeLevel: 'asc' } }, { name: 'asc' }],
    }),
  );
  return writeXlsx([
    { name: 'Students', rows: [COLUMNS.map((c) => c.label)], widths: COLUMNS.map((c) => c.width), boldFirstRow: true },
    {
      name: 'How to fill',
      boldFirstRow: true,
      widths: [18, 10, 50],
      rows: [
        ['Column', 'Required', 'What to write'],
        ...COLUMNS.map((c) => [c.label, c.required ? 'Yes' : 'No', c.hint]),
        [],
        ['Classes this year', 'Section', ''],
        ...sections.map((s) => [s.class.name, s.name, `${s.capacity ? `Capacity ${s.capacity}` : ''}`]),
        [],
        ['Tips', '', 'One student per row. Don’t use formulas. Usernames and passwords are created for you.'],
      ],
    },
  ]);
}

function decodeFile(fileName: string, base64: string): string[][] {
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) throw new AppError('VALIDATION_FAILED', 'The file is empty');
  if (buf.length > DEFAULT_LIMITS.maxFileBytes) throw new AppError('VALIDATION_FAILED', 'The file is larger than 2 MB');
  try {
    // Sniff the content, not the name: .xlsx files are ZIP archives ("PK\x03\x04").
    if (buf.readUInt32LE(0) === 0x04034b50) return readXlsx(buf, { ...DEFAULT_LIMITS, maxRows: MAX_ROWS + 1 });
    if (/\.xlsx?$/i.test(fileName) && buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1')
      throw new SpreadsheetError('Old .xls files aren’t supported. In Excel choose File → Save As → .xlsx');
    if (buf.includes(0)) throw new SpreadsheetError('Upload an .xlsx or .csv file');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return parseCsv(text, { maxRows: MAX_ROWS + 1, maxCols: DEFAULT_LIMITS.maxCols, maxCell: DEFAULT_LIMITS.maxCell });
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof SpreadsheetError) throw new AppError('VALIDATION_FAILED', e.message);
    if (e instanceof TypeError)
      throw new AppError('VALIDATION_FAILED', 'The file isn’t valid UTF-8 text. Save it as .xlsx or CSV UTF-8');
    throw new AppError('VALIDATION_FAILED', (e as Error).message || 'The file could not be read');
  }
}

function parseDate(v: string): string | null | 'invalid' {
  if (!v) return null;
  if (/^\d+(\.\d+)?$/.test(v)) return excelSerialToIso(Number(v)) ?? 'invalid';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  let iso: string | null = null;
  if (m) iso = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
  if (m) iso = `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`; // day first (Pakistan)
  if (!iso) return 'invalid';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? 'invalid' : iso;
}

export const previewSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  data: z.string().min(1).max(3_000_000),
  /** Client-generated idempotency key: re-uploading the same selection returns the same preview. */
  clientKey: z.string().uuid(),
});

export async function previewImport(ctx: AuthedContext, input: z.infer<typeof previewSchema>) {
  const existing = await inTenant(ctx, (tx) =>
    tx.job.findFirst({
      where: { type: IMPORT_TYPE, createdBy: ctx.user.id, payload: { path: ['clientKey'], equals: input.clientKey } },
    }),
  );
  if (existing) return getImport(ctx, existing.id);

  const grid = decodeFile(input.fileName, input.data);
  const headerAt = grid.findIndex((r) => r.some((c) => c.trim()));
  if (headerAt < 0) throw new AppError('VALIDATION_FAILED', 'The file has no rows');
  const header = grid[headerAt]!.map(norm);
  const colOf = {} as Record<Key, number>;
  for (const c of COLUMNS) {
    const idx = header.findIndex((h) => h === norm(c.label) || h.replace(/[^a-z]/g, '') === c.key.toLowerCase());
    if (idx < 0 && c.required)
      throw new AppError('VALIDATION_FAILED', `Column “${c.label}” is missing. Use the template.`);
    colOf[c.key] = idx;
  }
  const body = grid.slice(headerAt + 1).map((cells, i) => ({ rowNo: headerAt + i + 2, cells }));
  const dataRows = body.filter((r) => r.cells.some((c) => c.trim()));
  if (!dataRows.length) throw new AppError('VALIDATION_FAILED', 'The file has headers but no students');
  if (dataRows.length > MAX_ROWS)
    throw new AppError('VALIDATION_FAILED', `Import at most ${MAX_ROWS} students at a time`);

  return inTenant(ctx, async (tx) => {
    const sections = await tx.section.findMany({
      where: { class: { academicYear: { status: 'CURRENT' } } },
      include: { class: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
    });
    const byKey = new Map(sections.map((s) => [`${norm(s.class.name)}|${norm(s.name)}`, s]));
    const admissionNos = dataRows
      .map((r) => (colOf.admissionNo >= 0 ? (r.cells[colOf.admissionNo] ?? '').trim() : ''))
      .filter(Boolean);
    const taken = new Set(
      (await tx.student.findMany({ where: { admissionNo: { in: admissionNos } }, select: { admissionNo: true } })).map(
        (s) => s.admissionNo!.toLowerCase(),
      ),
    );

    const rows: ImportRow[] = [];
    const errors: RowError[] = [];
    const seenAdmission = new Map<string, number>();
    const addedPerSection = new Map<string, number>();
    for (const { rowNo, cells } of dataRows) {
      const get = (k: Key) => (colOf[k] >= 0 ? (cells[colOf[k]] ?? '').trim() : '');
      const err = (column: string, message: string) => errors.push({ row: rowNo, column, message });
      const before = errors.length;
      const looksLikeFormula = (v: string) => /^[=@]|^[+-][^\d\s]/.test(v);

      const name = get('name').replace(/\s+/g, ' ');
      if (!name) err('Student name', 'Missing');
      else if (name.length < 2 || name.length > 120) err('Student name', 'Use 2–120 characters');
      else if (looksLikeFormula(name)) err('Student name', 'Looks like a formula');

      const cls = get('class');
      const sec = get('section');
      const section = byKey.get(`${norm(cls)}|${norm(sec)}`);
      if (!cls || !sec) err('Class / Section', 'Missing');
      else if (!section) err('Class / Section', `No section ${cls}-${sec} this year`);

      const admissionNo = get('admissionNo');
      if (admissionNo) {
        if (admissionNo.length > 30 || looksLikeFormula(admissionNo))
          err('Admission no', 'Not a valid admission number');
        else if (taken.has(admissionNo.toLowerCase())) err('Admission no', 'Already used by another student');
        else if (seenAdmission.has(admissionNo.toLowerCase()))
          err('Admission no', `Same as row ${seenAdmission.get(admissionNo.toLowerCase())}`);
        seenAdmission.set(admissionNo.toLowerCase(), rowNo);
      }

      const g = get('gender').toLowerCase();
      const gender = !g
        ? null
        : g.startsWith('m') || g === 'boy'
          ? 'MALE'
          : g.startsWith('f') || g === 'girl'
            ? 'FEMALE'
            : g.startsWith('o')
              ? 'OTHER'
              : 'bad';
      if (gender === 'bad') err('Gender', 'Use Male, Female or Other');

      const dob = parseDate(get('dateOfBirth'));
      if (dob === 'invalid') err('Date of birth', 'Use a date like 2014-05-21 or 21/05/2014');

      const phoneRaw = get('guardianPhone');
      const phone = phoneRaw.replace(/[^\d+]/g, '');
      if (phoneRaw && !/^\+?\d{7,15}$/.test(phone)) err('Guardian phone', 'Not a valid phone number');
      const guardianName = get('guardianName');
      if (guardianName.length > 120 || looksLikeFormula(guardianName)) err('Guardian name', 'Not a valid name');
      const address = get('address');
      if (address.length > 300 || looksLikeFormula(address)) err('Address', 'Not a valid address');

      if (errors.length === before && section) {
        rows.push({
          row: rowNo,
          name,
          sectionId: section.id,
          section: sectionLabel(section),
          admissionNo: admissionNo || null,
          gender: gender as ImportRow['gender'],
          dateOfBirth: dob as string | null,
          guardianName: guardianName || null,
          guardianPhone: phone || null,
          address: address || null,
        });
        addedPerSection.set(section.id, (addedPerSection.get(section.id) ?? 0) + 1);
      }
    }
    const warnings = sections
      .filter(
        (s) => s.capacity && addedPerSection.has(s.id) && s._count.students + addedPerSection.get(s.id)! > s.capacity,
      )
      .map(
        (s) =>
          `${sectionLabel(s)} will have ${s._count.students + addedPerSection.get(s.id)!} students (capacity ${s.capacity})`,
      );

    const payload: Payload = {
      fileName: input.fileName,
      clientKey: input.clientKey,
      rows,
      total: dataRows.length,
      errors: errors.slice(0, 500),
      warnings,
    };
    const job = await tx.job.create({
      data: {
        tenantId: ctx.tenantId!,
        type: IMPORT_TYPE,
        status: 'QUEUED',
        payload: payload as unknown as Prisma.InputJsonValue,
        progress: { done: 0, created: 0 },
        createdBy: ctx.user.id,
      },
    });
    await audit(ctx, tx, {
      action: 'import.preview',
      entity: 'Job',
      entityId: job.id,
      metadata: { fileName: input.fileName, total: dataRows.length, valid: rows.length, errors: errors.length },
    });
    return shapeJob(job.id, 'QUEUED', payload, { done: 0, created: 0 }, null);
  });
}

function shapeJob(id: string, status: string, p: Payload, progress: Progress, error: string | null) {
  const bySection = new Map<string, number>();
  for (const r of p.rows) bySection.set(r.section, (bySection.get(r.section) ?? 0) + 1);
  return {
    id,
    status,
    fileName: p.fileName,
    total: p.total,
    valid: p.rows.length,
    errors: p.errors,
    warnings: p.warnings,
    bySection: [...bySection.entries()].map(([section, count]) => ({ section, count })),
    sample: p.rows
      .slice(0, 8)
      .map((r) => ({ row: r.row, name: r.name, section: r.section, admissionNo: r.admissionNo })),
    done: progress.done,
    created: progress.created,
    error,
  };
}

export async function getImport(ctx: AuthedContext, id: string) {
  const job = await inTenant(ctx, (tx) => tx.job.findFirst({ where: { id, type: IMPORT_TYPE } }));
  if (!job) throw notFound('Import');
  return shapeJob(
    job.id,
    job.status,
    job.payload as unknown as Payload,
    (job.progress ?? { done: 0, created: 0 }) as Progress,
    job.error,
  );
}

/**
 * Creates the next chunk of students. Concurrent or repeated calls are serialised by a row lock on the job, and
 * progress is saved in the same transaction as the students, so each row is admitted exactly once.
 */
export async function commitImport(ctx: AuthedContext, id: string) {
  const pre = await inTenant(ctx, (tx) => tx.job.findFirst({ where: { id, type: IMPORT_TYPE } }));
  if (!pre) throw notFound('Import');
  const payload = pre.payload as unknown as Payload;
  if (!payload.rows.length) throw new AppError('VALIDATION_FAILED', 'There are no valid rows to import');
  const startAt = ((pre.progress ?? { done: 0 }) as Progress).done;
  // Hash outside the transaction (CPU-bound, runs in parallel); unused hashes are simply discarded.
  const creds = await Promise.all(
    payload.rows.slice(startAt, startAt + CHUNK).map(async () => {
      const temporaryPassword = generateTemporaryPassword();
      return { temporaryPassword, passwordHash: await hashPassword(temporaryPassword) };
    }),
  );

  try {
    return await inTenant(
      ctx,
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM jobs WHERE id = ${id}::uuid FOR UPDATE`;
        const job = await tx.job.findUniqueOrThrow({ where: { id } });
        const progress = (job.progress ?? { done: 0, created: 0 }) as Progress;
        if (job.status === 'SUCCEEDED' || progress.done >= payload.rows.length) {
          return { ...shapeJob(id, 'SUCCEEDED', payload, progress, null), finished: true, credentials: [] };
        }
        if (progress.done !== startAt) {
          // Another call moved ahead meanwhile; the client simply calls again.
          return { ...shapeJob(id, job.status, payload, progress, null), finished: false, credentials: [] };
        }
        const prefix = await tenantPrefix(tx);
        const chunk = payload.rows.slice(progress.done, progress.done + CHUNK);
        const credentials: {
          name: string;
          username: string;
          temporaryPassword: string;
          section: string;
          rollNumber: number;
        }[] = [];
        for (const [i, r] of chunk.entries()) {
          const { section, rollNumber } = await placeInSection(tx, r.sectionId);
          const username = studentUsername({
            prefix,
            className: section.class.name,
            sectionName: section.name,
            displayName: r.name,
            rollNumber,
          });
          const { user, temporaryPassword } = await createLogin(
            tx,
            { tenantId: ctx.tenantId!, role: 'STUDENT', displayName: r.name, username },
            creds[i],
          );
          await tx.student.create({
            data: {
              tenantId: ctx.tenantId!,
              userId: user.id,
              sectionId: section.id,
              rollNumber,
              admissionNo: r.admissionNo,
              gender: r.gender,
              dateOfBirth: r.dateOfBirth ? toDate(r.dateOfBirth) : null,
              guardianName: r.guardianName,
              guardianPhone: r.guardianPhone,
              address: r.address,
            },
          });
          credentials.push({ name: r.name, username, temporaryPassword, section: sectionLabel(section), rollNumber });
        }
        const next: Progress = { done: progress.done + chunk.length, created: progress.created + chunk.length };
        const finished = next.done >= payload.rows.length;
        await tx.job.update({
          where: { id },
          data: {
            status: finished ? 'SUCCEEDED' : 'RUNNING',
            progress: next,
            startedAt: job.startedAt ?? new Date(),
            finishedAt: finished ? new Date() : null,
            attempts: { increment: 1 },
          },
        });
        await audit(ctx, tx, {
          action: 'import.commit',
          entity: 'Job',
          entityId: id,
          metadata: { from: progress.done + 1, to: next.done, total: payload.rows.length },
        });
        return { ...shapeJob(id, finished ? 'SUCCEEDED' : 'RUNNING', payload, next, null), finished, credentials };
      },
      30_000,
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError(
        'CONFLICT',
        'An admission number in this file was used by someone else meanwhile. Fix it and upload again.',
      );
    }
    throw e;
  }
}

export async function recentImports(ctx: AuthedContext) {
  const jobs = await inTenant(ctx, (tx) =>
    tx.job.findMany({ where: { type: IMPORT_TYPE }, orderBy: { createdAt: 'desc' }, take: 10 }),
  );
  return jobs.map((j) => {
    const p = j.payload as unknown as Payload;
    const pr = (j.progress ?? { done: 0, created: 0 }) as Progress;
    return {
      id: j.id,
      fileName: p.fileName,
      status: j.status,
      total: p.total,
      valid: p.rows.length,
      created: pr.created,
      createdAt: j.createdAt,
    };
  });
}
