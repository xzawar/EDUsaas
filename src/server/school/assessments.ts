import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { DAY_MS, MARKS_CORRECTION_DAYS, audit, inTenant, isoDate, schoolClock, sectionLabel, teacherScope, toDate } from '@/server/school/common';
import { notify } from '@/server/school/notifications';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-03');
export type Band = { grade: string; min: number };

/** Grade from a versioned scheme (spec §7.2). Bands are percent minimums, highest first. */
export function gradeFor(bands: Band[], pct: number | null): string | null {
  if (pct === null) return null;
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  return sorted.find((b) => pct >= b.min)?.grade ?? sorted[sorted.length - 1]?.grade ?? null;
}

const pctOf = (score: Prisma.Decimal | number | null, max: Prisma.Decimal | number) =>
  score === null ? null : Math.round((Number(score) / Number(max)) * 1000) / 10;

/** Teacher may work on (section, subject) only if assigned to it (spec §2.4). */
async function canEnter(ctx: AuthedContext, tx: TenantTx, sectionId: string, subjectId: string) {
  if (ctx.can('marks.manage')) return true;
  if (!ctx.can('marks.enter')) return false;
  const scope = await teacherScope(tx, ctx.user.id);
  return scope.assignments.some((a) => a.sectionId === sectionId && a.subjectId === subjectId);
}

function canPublish(ctx: AuthedContext, publisher: string) {
  return ctx.user.role === 'SCHOOL_ADMIN' || (ctx.user.role === 'PRINCIPAL' && publisher === 'PRINCIPAL');
}

export const listAssessmentsQuery = z.object({
  sectionId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'PUBLISHED']).optional(),
});

export async function listAssessments(ctx: AuthedContext, query: z.infer<typeof listAssessmentsQuery>) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) return [];
    let scopeFilter: Prisma.AssessmentWhereInput = {};
    if (!ctx.can('marks.manage') && ctx.user.role === 'TEACHER') {
      const scope = await teacherScope(tx, ctx.user.id);
      scopeFilter = { OR: scope.assignments.map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId })) };
      if (!scope.assignments.length) return [];
    }
    const rows = await tx.assessment.findMany({
      where: { academicYearId: year.id, ...scopeFilter, ...(query.sectionId ? { sectionId: query.sectionId } : {}), ...(query.status ? { status: query.status } : {}) },
      include: { section: { include: { class: true } }, subject: { select: { name: true } }, _count: { select: { marks: true } } },
      orderBy: [{ heldOn: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      section: sectionLabel(a.section),
      sectionId: a.sectionId,
      subject: a.subject.name,
      maxMarks: Number(a.maxMarks),
      heldOn: isoDate(a.heldOn)!,
      status: a.status,
      marksEntered: a._count.marks,
    }));
  });
}

export const createAssessmentSchema = z.object({
  sectionId: z.string().uuid(),
  subjectId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  maxMarks: z.number().positive().max(1000),
  heldOn: dateStr,
});

export async function createAssessment(ctx: AuthedContext, input: z.infer<typeof createAssessmentSchema>) {
  return inTenant(ctx, async (tx) => {
    if (!(await canEnter(ctx, tx, input.sectionId, input.subjectId))) throw forbidden('You don’t teach this subject in this section');
    const section = await tx.section.findUnique({ where: { id: input.sectionId }, include: { class: { include: { subjects: true } } } });
    if (!section) throw notFound('Section');
    if (!section.class.subjects.some((s) => s.subjectId === input.subjectId)) throw new AppError('VALIDATION_FAILED', 'That subject isn’t taught in this class');
    const scheme = await tx.gradingScheme.findFirst({ where: { academicYearId: section.class.academicYearId }, orderBy: { version: 'desc' } });
    if (!scheme) throw new AppError('VALIDATION_FAILED', 'This academic year has no grading scale');
    const a = await tx.assessment.create({
      data: {
        tenantId: ctx.tenantId!,
        academicYearId: section.class.academicYearId,
        sectionId: input.sectionId,
        subjectId: input.subjectId,
        gradingSchemeId: scheme.id,
        name: input.name,
        maxMarks: input.maxMarks,
        heldOn: toDate(input.heldOn),
        createdBy: ctx.user.id,
      },
    });
    await audit(ctx, tx, { action: 'assessment.create', entity: 'Assessment', entityId: a.id, after: input });
    return a;
  });
}

/** The marks sheet with what the caller may do (spec §7.1, §7.3). */
export async function getAssessment(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const a = await tx.assessment.findUnique({
      where: { id },
      include: { section: { include: { class: true } }, subject: { select: { name: true } }, gradingScheme: true, marks: true },
    });
    if (!a || !(await canEnter(ctx, tx, a.sectionId, a.subjectId)) && !canPublish(ctx, (await schoolClock(tx)).marksPublisher)) throw notFound('Assessment');
    const clock = await schoolClock(tx);
    const students = await tx.student.findMany({ where: { sectionId: a.sectionId, status: 'ACTIVE' }, include: { user: { select: { displayName: true } } }, orderBy: { rollNumber: 'asc' } });
    const byStudent = new Map(a.marks.map((m) => [m.studentId, m]));
    const bands = a.gradingScheme.bands as Band[];
    const enterer = await canEnter(ctx, tx, a.sectionId, a.subjectId);
    const windowEnds = a.submittedAt ? new Date(a.submittedAt.getTime() + MARKS_CORRECTION_DAYS * DAY_MS) : null;
    const inWindow = !windowEnds || windowEnds.getTime() > clock.now.getTime();
    const canEdit = ctx.can('marks.manage') || (enterer && (a.status === 'DRAFT' || inWindow));
    const scores = a.marks.filter((m) => m.score !== null).map((m) => Number(m.score));
    return {
      id: a.id,
      name: a.name,
      section: sectionLabel(a.section),
      sectionId: a.sectionId,
      subject: a.subject.name,
      maxMarks: Number(a.maxMarks),
      heldOn: isoDate(a.heldOn)!,
      status: a.status,
      submittedAt: a.submittedAt,
      publishedAt: a.publishedAt,
      bands,
      canEdit,
      canSubmit: enterer && a.status === 'DRAFT',
      canPublish: canPublish(ctx, clock.marksPublisher) && a.status === 'SUBMITTED',
      editableUntil: a.status !== 'DRAFT' && !ctx.can('marks.manage') ? windowEnds : null,
      lockedReason: canEdit ? null : `The ${MARKS_CORRECTION_DAYS}-day correction window has closed. Ask the School Admin.`,
      stats: scores.length
        ? { count: scores.length, average: Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10, highest: Math.max(...scores), lowest: Math.min(...scores) }
        : null,
      students: students.map((s) => {
        const m = byStudent.get(s.id);
        const pct = m ? pctOf(m.score, a.maxMarks) : null;
        return { id: s.id, name: s.user.displayName, rollNumber: s.rollNumber, score: m?.score === null || m?.score === undefined ? null : Number(m.score), absent: m?.absent ?? false, pct, grade: gradeFor(bands, pct) };
      }),
    };
  });
}

export const saveMarksSchema = z.object({
  marks: z.array(z.object({ studentId: z.string().uuid(), score: z.number().min(0).nullable(), absent: z.boolean().default(false) })).max(200),
  submit: z.boolean().default(false),
});

/** Batch save (spec §2.4). Edits after submission are corrections: before/after audited (spec §7.3). */
export async function saveMarks(ctx: AuthedContext, id: string, input: z.infer<typeof saveMarksSchema>) {
  return inTenant(ctx, async (tx) => {
    const sheet = await getAssessmentRow(tx, id);
    const clock = await schoolClock(tx);
    if (!(await canEnter(ctx, tx, sheet.sectionId, sheet.subjectId))) throw notFound('Assessment');
    const windowEnds = sheet.submittedAt ? sheet.submittedAt.getTime() + MARKS_CORRECTION_DAYS * DAY_MS : null;
    if (sheet.status !== 'DRAFT' && !ctx.can('marks.manage') && windowEnds !== null && clock.now.getTime() > windowEnds) {
      throw new AppError('FORBIDDEN', `The ${MARKS_CORRECTION_DAYS}-day correction window has closed. Ask the School Admin.`);
    }
    const max = Number(sheet.maxMarks);
    for (const m of input.marks) {
      if (m.score !== null && m.score > max) throw new AppError('VALIDATION_FAILED', `Marks can’t be more than ${max}`);
      if (m.absent && m.score !== null) throw new AppError('VALIDATION_FAILED', 'A student marked absent can’t have a score');
    }
    const valid = await tx.student.count({ where: { id: { in: input.marks.map((m) => m.studentId) }, sectionId: sheet.sectionId } });
    if (valid !== new Set(input.marks.map((m) => m.studentId)).size) throw new AppError('VALIDATION_FAILED', 'Some students are not in this section');

    const existing = new Map(sheet.marks.map((m) => [m.studentId, m]));
    const changes: { student: string; from: unknown; to: unknown }[] = [];
    for (const m of input.marks) {
      const before = existing.get(m.studentId);
      const beforeScore = before?.score === null || before?.score === undefined ? null : Number(before.score);
      if (before && beforeScore === m.score && before.absent === m.absent) continue;
      await tx.mark.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: m.studentId } },
        create: { tenantId: ctx.tenantId!, assessmentId: id, studentId: m.studentId, score: m.score, absent: m.absent, updatedBy: ctx.user.id },
        update: { score: m.score, absent: m.absent, updatedBy: ctx.user.id },
      });
      changes.push({ student: m.studentId, from: before ? (before.absent ? 'absent' : beforeScore) : null, to: m.absent ? 'absent' : m.score });
    }
    let status = sheet.status;
    if (input.submit && sheet.status === 'DRAFT') {
      await tx.assessment.update({ where: { id }, data: { status: 'SUBMITTED', submittedBy: ctx.user.id, submittedAt: clock.now } });
      status = 'SUBMITTED';
      await audit(ctx, tx, { action: 'marks.submit', entity: 'Assessment', entityId: id, metadata: { count: input.marks.length } });
      const publishers = await tx.user.findMany({ where: { role: clock.marksPublisher === 'PRINCIPAL' ? 'PRINCIPAL' : 'SCHOOL_ADMIN', status: 'ACTIVE' }, select: { id: true } });
      await notify(tx, ctx.tenantId!, publishers.map((p) => p.id), { kind: 'marks', title: 'Marks ready to publish', body: `${sheet.name} has been submitted.`, link: `/staff/assessments/${id}` });
    } else if (sheet.status !== 'DRAFT' && changes.length) {
      await audit(ctx, tx, { action: 'marks.correct', entity: 'Assessment', entityId: id, metadata: { changes } });
    }
    return { saved: changes.length, status };
  });
}

async function getAssessmentRow(tx: TenantTx, id: string) {
  const a = await tx.assessment.findUnique({ where: { id }, include: { marks: true } });
  if (!a) throw notFound('Assessment');
  return a;
}

export async function publishAssessment(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    if (!canPublish(ctx, clock.marksPublisher)) throw forbidden('Only the School Admin (or Principal, if your school allows it) can publish marks');
    const a = await getAssessmentRow(tx, id);
    if (a.status !== 'SUBMITTED') throw new AppError('CONFLICT', a.status === 'PUBLISHED' ? 'Already published' : 'The teacher hasn’t submitted these marks yet');
    await tx.assessment.update({ where: { id }, data: { status: 'PUBLISHED', publishedBy: ctx.user.id, publishedAt: clock.now } });
    await audit(ctx, tx, { action: 'marks.publish', entity: 'Assessment', entityId: id });
    const students = await tx.student.findMany({ where: { sectionId: a.sectionId, status: 'ACTIVE' }, select: { userId: true } });
    await notify(tx, ctx.tenantId!, students.map((s) => s.userId), { kind: 'marks', title: 'New marks published', body: a.name, link: '/student/marks' });
    return { ok: true };
  });
}

export async function deleteAssessment(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const a = await getAssessmentRow(tx, id);
    if (!(await canEnter(ctx, tx, a.sectionId, a.subjectId))) throw notFound('Assessment');
    if (a.status !== 'DRAFT' && !ctx.can('marks.manage')) throw new AppError('CONFLICT', 'Only drafts can be deleted');
    await tx.assessment.delete({ where: { id } });
    await audit(ctx, tx, { action: 'assessment.delete', entity: 'Assessment', entityId: id, before: { name: a.name, status: a.status } });
    return { ok: true };
  });
}

/** Published results for a student (spec §2.6), grouped by subject with averages. */
export async function studentResults(ctx: AuthedContext, studentId?: string) {
  return inTenant(ctx, async (tx) => {
    const s = studentId ? await tx.student.findUnique({ where: { id: studentId } }) : await tx.student.findUnique({ where: { userId: ctx.user.id } });
    if (!s) throw notFound('Student');
    const marks = await tx.mark.findMany({
      where: { studentId: s.id, assessment: { status: 'PUBLISHED', academicYear: { status: 'CURRENT' } } },
      include: { assessment: { include: { subject: { select: { name: true } }, gradingScheme: true } } },
      orderBy: { assessment: { heldOn: 'desc' } },
    });
    const items = marks.map((m) => {
      const pct = pctOf(m.score, m.assessment.maxMarks);
      return {
        id: m.assessment.id,
        name: m.assessment.name,
        subject: m.assessment.subject.name,
        heldOn: isoDate(m.assessment.heldOn)!,
        score: m.score === null ? null : Number(m.score),
        maxMarks: Number(m.assessment.maxMarks),
        absent: m.absent,
        pct,
        grade: gradeFor(m.assessment.gradingScheme.bands as Band[], pct),
      };
    });
    const bySubject = new Map<string, { total: number; max: number }>();
    for (const i of items) {
      if (i.score === null) continue;
      const t = bySubject.get(i.subject) ?? { total: 0, max: 0 };
      t.total += i.score;
      t.max += i.maxMarks;
      bySubject.set(i.subject, t);
    }
    const bands = (marks[0]?.assessment.gradingScheme.bands as Band[] | undefined) ?? null;
    const subjects = [...bySubject.entries()]
      .map(([subject, t]) => {
        const pct = Math.round((t.total / t.max) * 1000) / 10;
        return { subject, pct, grade: bands ? gradeFor(bands, pct) : null };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
    return { items, subjects };
  });
}

// ── Grading scale (spec §7.2: versioned per year; editing never rewrites issued results) ──

export async function currentScheme(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) return null;
    const scheme = await tx.gradingScheme.findFirst({ where: { academicYearId: year.id }, orderBy: { version: 'desc' }, include: { _count: { select: { assessments: true } } } });
    return scheme ? { yearName: year.name, version: scheme.version, bands: scheme.bands as Band[], inUse: scheme._count.assessments > 0 } : null;
  });
}

export const schemeSchema = z.object({
  bands: z
    .array(z.object({ grade: z.string().trim().min(1).max(4), min: z.number().min(0).max(100) }))
    .min(2)
    .max(12)
    .refine((b) => b.some((x) => x.min === 0), 'One grade must start at 0%')
    .refine((b) => new Set(b.map((x) => x.min)).size === b.length, 'Each grade needs a different minimum')
    .refine((b) => new Set(b.map((x) => x.grade.toUpperCase())).size === b.length, 'Grade names must be unique'),
});

export async function saveScheme(ctx: AuthedContext, input: z.infer<typeof schemeSchema>) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) throw new AppError('VALIDATION_FAILED', 'Set a current academic year first');
    const latest = await tx.gradingScheme.findFirst({ where: { academicYearId: year.id }, orderBy: { version: 'desc' }, include: { _count: { select: { assessments: true } } } });
    const bands = [...input.bands].sort((a, b) => b.min - a.min);
    if (latest && latest._count.assessments === 0) {
      await tx.gradingScheme.update({ where: { id: latest.id }, data: { bands } });
    } else {
      // In use: create a new version for future tests; existing results keep their scale.
      await tx.gradingScheme.create({ data: { tenantId: ctx.tenantId!, academicYearId: year.id, version: (latest?.version ?? 0) + 1, bands } });
    }
    await audit(ctx, tx, { action: 'grading.update', entity: 'GradingScheme', entityId: year.id, before: latest?.bands ?? null, after: bands });
    return { ok: true, newVersion: !!latest && latest._count.assessments > 0 };
  });
}

// ── Remarks (spec §7.4) ─────────────────────────────────────────────────────

export const remarkSchema = z.object({ studentId: z.string().uuid(), text: z.string().trim().min(2).max(1000), subjectName: z.string().trim().max(60).optional() });

export async function addRemark(ctx: AuthedContext, input: z.infer<typeof remarkSchema>) {
  return inTenant(ctx, async (tx) => {
    const s = await tx.student.findUnique({ where: { id: input.studentId } });
    if (!s) throw notFound('Student');
    if (!ctx.can('marks.manage')) {
      const scope = await teacherScope(tx, ctx.user.id);
      if (!s.sectionId || !scope.sectionIds.includes(s.sectionId)) throw notFound('Student');
    }
    const autoApprove = ctx.user.role === 'SCHOOL_ADMIN';
    const r = await tx.remark.create({
      data: {
        tenantId: ctx.tenantId!,
        studentId: s.id,
        authorId: ctx.user.id,
        subjectName: input.subjectName || null,
        text: input.text,
        status: autoApprove ? 'APPROVED' : 'PENDING',
        moderatedBy: autoApprove ? ctx.user.id : null,
        moderatedAt: autoApprove ? new Date() : null,
      },
    });
    await audit(ctx, tx, { action: 'remark.create', entity: 'Remark', entityId: r.id, metadata: { studentId: s.id } });
    return r;
  });
}

async function moderatableSections(ctx: AuthedContext, tx: TenantTx) {
  if (ctx.user.role === 'SCHOOL_ADMIN' || ctx.can('marks.manage')) return null; // all
  return (await teacherScope(tx, ctx.user.id)).inchargeSectionIds;
}

export async function remarksQueue(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const sections = await moderatableSections(ctx, tx);
    if (sections && !sections.length) return [];
    const rows = await tx.remark.findMany({
      where: { status: 'PENDING', ...(sections ? { student: { sectionId: { in: sections } } } : {}) },
      include: { author: { select: { displayName: true } }, student: { include: { user: { select: { displayName: true } }, section: { include: { class: true } } } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      subject: r.subjectName,
      author: r.author.displayName,
      student: r.student.user.displayName,
      studentId: r.studentId,
      section: r.student.section ? sectionLabel(r.student.section) : '—',
      createdAt: r.createdAt,
    }));
  });
}

export const moderateSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']) });

export async function moderateRemark(ctx: AuthedContext, id: string, input: z.infer<typeof moderateSchema>) {
  return inTenant(ctx, async (tx) => {
    const r = await tx.remark.findUnique({ where: { id }, include: { student: true } });
    if (!r) throw notFound('Remark');
    const sections = await moderatableSections(ctx, tx);
    if (sections && (!r.student.sectionId || !sections.includes(r.student.sectionId))) throw notFound('Remark');
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', 'Already moderated');
    await tx.remark.update({ where: { id }, data: { status: input.decision, moderatedBy: ctx.user.id, moderatedAt: new Date() } });
    await audit(ctx, tx, { action: input.decision === 'APPROVED' ? 'remark.approve' : 'remark.reject', entity: 'Remark', entityId: id });
    return { ok: true };
  });
}

export async function studentRemarks(ctx: AuthedContext, studentId: string, approvedOnly: boolean) {
  return inTenant(ctx, async (tx) =>
    (
      await tx.remark.findMany({
        where: { studentId, ...(approvedOnly ? { status: 'APPROVED' } : {}) },
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    ).map((r) => ({ id: r.id, text: r.text, subject: r.subjectName, author: r.author.displayName, status: r.status, createdAt: r.createdAt })),
  );
}

/** Assessments a teacher still has to finish (drafts) — for the Today page. */
export async function teacherMarksTodo(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) =>
    tx.assessment.count({ where: { createdBy: ctx.user.id, status: 'DRAFT' } }),
  );
}

export async function unpublishedCount(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => tx.assessment.count({ where: { status: 'SUBMITTED' } }));
}


/** (section, subject) pairs the caller can create tests for. */
export async function teachOptions(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const where: Prisma.TeacherAssignmentWhereInput = { section: { class: { academicYear: { status: 'CURRENT' } } } };
    if (!ctx.can('marks.manage')) {
      const t = await tx.teacher.findUnique({ where: { userId: ctx.user.id } });
      if (!t || !ctx.can('marks.enter')) return [];
      where.teacherId = t.id;
    }
    const rows = await tx.teacherAssignment.findMany({ where, include: { section: { include: { class: true } }, subject: true } });
    const seen = new Set<string>();
    return rows
      .filter((r) => !seen.has(`${r.sectionId}:${r.subjectId}`) && seen.add(`${r.sectionId}:${r.subjectId}`))
      .sort((a, b) => a.section.class.gradeLevel - b.section.class.gradeLevel || a.section.name.localeCompare(b.section.name) || a.subject.name.localeCompare(b.subject.name))
      .map((r) => ({ sectionId: r.sectionId, section: sectionLabel(r.section), subjectId: r.subjectId, subject: r.subject.name }));
  });
}
