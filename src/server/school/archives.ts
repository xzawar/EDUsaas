import 'server-only';
import { storage, STORAGE_MISSING } from '@/server/files/storage';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { YEAR_ARCHIVE, processYearArchives } from '@/server/jobs/archive';
import { canViewMarks } from '@/server/school/assessments';
import { inTenant } from '@/server/school/common';
import { getStudent } from '@/server/school/people';

/** School side of the year archive (spec §5.4, §10.2): progress, "continue now", and past report cards. */

type Progress = { done: number; archived: number; failed: string[] };

export async function yearArchiveJobs(ctx: AuthedContext) {
  const jobs = await inTenant(ctx, (tx) =>
    tx.job.findMany({ where: { type: YEAR_ARCHIVE }, orderBy: { createdAt: 'desc' }, take: 10 }),
  );
  return jobs.map((j) => {
    const p = j.payload as { yearName: string; studentIds: string[] };
    const pr = (j.progress ?? { done: 0, archived: 0, failed: [] }) as Progress;
    return {
      id: j.id,
      year: p.yearName,
      total: p.studentIds.length,
      done: pr.done,
      archived: pr.archived,
      failed: pr.failed.length,
      status: j.status,
      error: j.error,
      createdAt: j.createdAt,
    };
  });
}

/** Process the next chunk now (instead of waiting for the nightly job). Only this school's job can be touched. */
export async function continueYearArchive(ctx: AuthedContext, id: string) {
  const job = await inTenant(ctx, (tx) => tx.job.findFirst({ where: { id, type: YEAR_ARCHIVE } }));
  if (!job) throw notFound('Archive');
  if (!storage()) throw new AppError('CONFLICT', STORAGE_MISSING);
  await processYearArchives(25, job.id);
  return (await yearArchiveJobs(ctx)).find((j) => j.id === id)!;
}

async function assertCanSee(ctx: AuthedContext, studentId: string) {
  if (ctx.user.role === 'STUDENT') {
    const me = await inTenant(ctx, (tx) =>
      tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
    );
    if (me?.id !== studentId) throw notFound('Report card');
    return;
  }
  if (!canViewMarks(ctx)) throw forbidden('You don’t have access to marks');
  await getStudent(ctx, studentId); // teacher scope + 404 for other schools
}

export async function studentArchives(ctx: AuthedContext, studentId: string) {
  await assertCanSee(ctx, studentId);
  const rows = await inTenant(ctx, (tx) =>
    tx.studentArchive.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
  );
  return rows.map((r) => ({ id: r.id, year: r.yearName, bytes: r.bytes, createdAt: r.createdAt }));
}

export async function myArchives(ctx: AuthedContext) {
  const me = await inTenant(ctx, (tx) =>
    tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }),
  );
  return me ? studentArchives(ctx, me.id) : [];
}

export async function archiveDownload(ctx: AuthedContext, id: string) {
  const row = await inTenant(ctx, (tx) => tx.studentArchive.findUnique({ where: { id } }));
  if (!row) throw notFound('Report card');
  await assertCanSee(ctx, row.studentId);
  const file = await storage()?.get(row.storageKey);
  if (!file) throw new AppError('CONFLICT', STORAGE_MISSING);
  return new Response(file.body as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-card-${row.yearName.replace(/[^\w-]/g, '-')}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
