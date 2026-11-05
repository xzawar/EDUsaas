import 'server-only';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import type { AttendanceStatus } from '@prisma/client';
import { recordAudit } from '@/server/audit/audit';
import { systemDb } from '@/server/db/system';
import { storage } from '@/server/files/storage';
import { gradeFor, type Band } from '@/server/school/assessments';
import { countedPeriods } from '@/server/school/common';
import { renderReportCard, type Card } from '@/server/school/reportcard';

/**
 * Archival (spec §5.4, §10). Runs as the system role because it spans schools; every query is filtered by tenant
 * explicitly, and every school-visible effect is audited in that school.
 *
 *  - Year archive, after promotion: one report-card PDF per student for the closed year goes to storage
 *    (reports/{tenant}/{year}/{student}-report-card.pdf); only after the upload is read back and verified are that
 *    student's attendance and marks rows for the year deleted. Chunked and resumable.
 *  - Audit archive, monthly: each finished month of a school's audit log becomes one gzip JSON file; the rows are
 *    then removed through delete_archived_audit_month(), which refuses unless the archive is recorded.
 */

export const YEAR_ARCHIVE = 'year_archive';
type YearPayload = { academicYearId: string; yearName: string; studentIds: string[] };
type YearProgress = { done: number; archived: number; failed: string[] };

const sha = (b: Uint8Array) => crypto.createHash('sha256').update(b).digest('hex');
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the report card shows, for one student and one (closed) academic year. */
export async function yearCard(tenantId: string, studentId: string, yearId: string): Promise<Card | null> {
  const db = systemDb();
  const [tenant, year, student, settings] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.academicYear.findFirst({ where: { id: yearId, tenantId } }),
    db.student.findFirst({ where: { id: studentId, tenantId }, include: { user: { select: { displayName: true } } } }),
    db.tenantSettings.findUnique({ where: { tenantId }, select: { atRiskThreshold: true, attendanceMode: true } }),
  ]);
  if (!tenant || !year || !student) return null;
  const inYear = {
    batch: {
      ...countedPeriods(settings?.attendanceMode ?? 'ONCE_DAILY'),
      section: { class: { academicYearId: yearId } },
    },
  };
  const [records, lastBatch, marks, remarks] = await Promise.all([
    db.attendanceRecord.groupBy({ by: ['status'], where: { tenantId, studentId, ...inYear }, _count: true }),
    db.attendanceRecord.findFirst({
      where: { tenantId, studentId, ...inYear },
      orderBy: { batch: { date: 'desc' } },
      select: { batch: { select: { section: { select: { name: true, class: { select: { name: true } } } } } } },
    }),
    db.mark.findMany({
      where: { tenantId, studentId, assessment: { academicYearId: yearId, status: 'PUBLISHED' } },
      include: {
        assessment: {
          include: { subject: { select: { name: true } }, gradingScheme: true, section: { include: { class: true } } },
        },
      },
      orderBy: { assessment: { heldOn: 'asc' } },
    }),
    db.remark.findMany({
      where: {
        tenantId,
        studentId,
        status: 'APPROVED',
        createdAt: { gte: year.startsOn, lte: new Date(year.endsOn.getTime() + 86400_000) },
      },
      include: { author: { select: { displayName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 8,
    }),
  ]);
  const c: Record<AttendanceStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, LEAVE: 0, EXCUSED: 0 };
  for (const r of records) c[r.status] = r._count;
  const considered = c.PRESENT + c.LATE + c.ABSENT;
  const bySubject = new Map<
    string,
    { got: number; max: number; bands: Band[]; tests: Card['subjects'][number]['tests'] }
  >();
  for (const m of marks) {
    const s = bySubject.get(m.assessment.subject.name) ?? {
      got: 0,
      max: 0,
      bands: m.assessment.gradingScheme.bands as Band[],
      tests: [],
    };
    const score = m.score === null ? null : Number(m.score);
    if (score !== null) {
      s.got += score;
      s.max += Number(m.assessment.maxMarks);
    }
    s.tests.push({ name: m.assessment.name, score, max: Number(m.assessment.maxMarks), absent: m.absent });
    bySubject.set(m.assessment.subject.name, s);
  }
  const sectionFromMarks = marks[0]?.assessment.section;
  const sec = lastBatch?.batch.section ?? sectionFromMarks ?? null;
  return {
    school: tenant.name,
    year: year.name,
    name: student.user.displayName,
    section: sec ? `${sec.class.name}-${sec.name}` : '—',
    rollNumber: student.rollNumber,
    admissionNo: student.admissionNo,
    attendance: {
      pct: considered ? Math.round(((c.PRESENT + c.LATE) / considered) * 1000) / 10 : null,
      present: c.PRESENT,
      late: c.LATE,
      absent: c.ABSENT,
      leave: c.LEAVE + c.EXCUSED,
    },
    subjects: [...bySubject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, s]) => {
        const pct = s.max ? Math.round((s.got / s.max) * 1000) / 10 : null;
        return { subject, pct, grade: gradeFor(s.bands, pct), tests: s.tests };
      }),
    remarks: remarks.map((r) => ({ text: r.text, author: r.author.displayName, subject: r.subjectName })),
    threshold: settings?.atRiskThreshold ?? 75,
    generatedOn: iso(new Date()),
  };
}

/** Called inside the promotion transaction: queue the closed year's archive for every student in the run. */
export function yearArchivePayload(academicYearId: string, yearName: string, studentIds: string[]): YearPayload {
  return { academicYearId, yearName, studentIds };
}

/** Archives up to `limit` students across queued year-archive jobs. Safe to run repeatedly and concurrently-ish. */
export async function processYearArchives(limit = 40, onlyJobId?: string) {
  const store = storage();
  if (!store) return 'skipped: storage not configured';
  const db = systemDb();
  const jobs = await db.job.findMany({
    where: { type: YEAR_ARCHIVE, status: { in: ['QUEUED', 'RUNNING'] }, ...(onlyJobId ? { id: onlyJobId } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 5,
  });
  let budget = limit;
  const summary: { job: string; archived: number; remaining: number }[] = [];
  for (const job of jobs) {
    if (budget <= 0) break;
    const p = job.payload as YearPayload;
    const prog = (job.progress ?? { done: 0, archived: 0, failed: [] }) as YearProgress;
    const tenantId = job.tenantId!;
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { prefix: true } });
    const slice = p.studentIds.slice(prog.done, prog.done + budget);
    for (const studentId of slice) {
      try {
        const existing = await db.studentArchive.findUnique({
          where: { studentId_academicYearId: { studentId, academicYearId: p.academicYearId } },
        });
        if (!existing) {
          const card = await yearCard(tenantId, studentId, p.academicYearId);
          if (card) {
            const pdf = await renderReportCard(card);
            const key = `reports/${tenant!.prefix}/${p.yearName.replace(/[^\w-]/g, '-')}/${studentId}-report-card.pdf`;
            await store.put(key, pdf, 'application/pdf');
            const back = await store.get(key);
            if (!back || sha(back.body) !== sha(pdf)) throw new Error('upload could not be verified');
            await db.studentArchive.create({
              data: {
                tenantId,
                studentId,
                academicYearId: p.academicYearId,
                yearName: p.yearName,
                storageKey: key,
                bytes: pdf.length,
              },
            });
          }
        }
        // Only now that the card is safely stored: drop the closed year's raw rows for this student (spec §10.2).
        await db.attendanceRecord.deleteMany({
          where: { tenantId, studentId, batch: { section: { class: { academicYearId: p.academicYearId } } } },
        });
        await db.mark.deleteMany({ where: { tenantId, studentId, assessment: { academicYearId: p.academicYearId } } });
        prog.archived++;
      } catch (e) {
        prog.failed.push(studentId);
        console.error('year archive failed', { job: job.id, studentId, err: (e as Error).message });
      }
      prog.done++;
      budget--;
    }
    const finished = prog.done >= p.studentIds.length;
    if (finished) {
      // Registers and tests of the closed year that no longer hold anyone's rows go too.
      await db.attendanceBatch.deleteMany({
        where: { tenantId, records: { none: {} }, section: { class: { academicYearId: p.academicYearId } } },
      });
      await db.assessment.deleteMany({ where: { tenantId, academicYearId: p.academicYearId, marks: { none: {} } } });
      await recordAudit({
        tenantId,
        action: 'archive.year',
        entity: 'AcademicYear',
        entityId: p.academicYearId,
        metadata: {
          year: p.yearName,
          students: p.studentIds.length,
          archived: prog.archived,
          failed: prog.failed.length,
        },
      });
    }
    await db.job.update({
      where: { id: job.id },
      data: {
        status: finished ? (prog.failed.length ? 'FAILED' : 'SUCCEEDED') : 'RUNNING',
        progress: prog,
        startedAt: job.startedAt ?? new Date(),
        finishedAt: finished ? new Date() : null,
        error: prog.failed.length
          ? `${prog.failed.length} report card(s) could not be archived; their records were kept`
          : null,
      },
    });
    summary.push({ job: job.id, archived: prog.archived, remaining: p.studentIds.length - prog.done });
  }
  return summary;
}

/** Monthly audit archive: every finished month per school (and the platform's own log) → one gzip JSON file. */
export async function archiveAuditMonths(now = new Date(), maxFiles = 12) {
  const store = storage();
  if (!store) return 'skipped: storage not configured';
  const db = systemDb();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const due = await db.$queryRaw<{ tenant_id: string | null; month: string; n: bigint }[]>`
    SELECT tenant_id, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, COUNT(*) AS n
    FROM audit_logs WHERE created_at < ${monthStart}
    GROUP BY 1, 2 ORDER BY 2, 1 LIMIT ${maxFiles}`;
  const done: { tenant: string | null; month: string; rows: number; deleted?: number; skipped?: string }[] = [];
  for (const d of due) {
    const existing = await db.auditArchive.findFirst({ where: { tenantId: d.tenant_id, month: d.month } });
    if (existing) {
      // Rows can only appear in a past month if a clock was wrong; never delete rows that aren't in a file.
      done.push({ tenant: d.tenant_id, month: d.month, rows: Number(d.n), skipped: 'archive already exists' });
      continue;
    }
    const start = new Date(`${d.month}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const rows = await db.auditLog.findMany({
      where: { tenantId: d.tenant_id, createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: 'asc' },
    });
    const body = new Uint8Array(zlib.gzipSync(Buffer.from(rows.map((r) => JSON.stringify(r)).join('\n'))));
    const prefix = d.tenant_id
      ? ((await db.tenant.findUnique({ where: { id: d.tenant_id }, select: { prefix: true } }))?.prefix ?? d.tenant_id)
      : 'platform';
    const key = `audit-archives/${prefix}/${d.month}.json.gz`;
    await store.put(key, body, 'application/gzip');
    const back = await store.get(key);
    if (!back || sha(back.body) !== sha(body)) {
      done.push({ tenant: d.tenant_id, month: d.month, rows: rows.length, skipped: 'upload could not be verified' });
      continue;
    }
    await db.auditArchive.create({
      data: { tenantId: d.tenant_id, month: d.month, storageKey: key, rows: rows.length, sha256: sha(body) },
    });
    const del = await db.$queryRaw<
      { n: number }[]
    >`SELECT delete_archived_audit_month(${d.tenant_id}::uuid, ${d.month}) AS n`;
    done.push({ tenant: d.tenant_id, month: d.month, rows: rows.length, deleted: Number(del[0]?.n ?? 0) });
  }
  return done;
}
