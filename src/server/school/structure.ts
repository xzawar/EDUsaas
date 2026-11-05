import 'server-only';
import { z } from 'zod';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { DEFAULT_GRADING_BANDS, audit, friendlyDbError, inTenant, isoDate, toDate } from '@/server/school/common';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-04-01');
const name = (max = 60) => z.string().trim().min(1, 'Required').max(max);

// ── Academic years ──────────────────────────────────────────────────────────

export const createYearSchema = z
  .object({ name: name(40), startsOn: dateStr, endsOn: dateStr, makeCurrent: z.boolean().default(false) })
  .refine((v) => v.endsOn > v.startsOn, { message: 'End date must be after start date', path: ['endsOn'] });

export const updateYearSchema = z
  .object({ name: name(40), startsOn: dateStr, endsOn: dateStr, status: z.enum(['PLANNED', 'CURRENT', 'CLOSED']) })
  .partial()
  .strict();

export async function listYears(ctx: AuthedContext) {
  const years = await inTenant(ctx, (tx) =>
    tx.academicYear.findMany({
      orderBy: { startsOn: 'desc' },
      include: { _count: { select: { classes: true } } },
    }),
  );
  return years.map((y) => ({
    id: y.id,
    name: y.name,
    startsOn: isoDate(y.startsOn)!,
    endsOn: isoDate(y.endsOn)!,
    status: y.status,
    classCount: y._count.classes,
  }));
}

export async function currentYear(ctx: AuthedContext) {
  return inTenant(ctx, (tx) => tx.academicYear.findFirst({ where: { status: 'CURRENT' } }));
}

export async function createYear(ctx: AuthedContext, input: z.infer<typeof createYearSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      if (input.makeCurrent)
        await tx.academicYear.updateMany({ where: { status: 'CURRENT' }, data: { status: 'CLOSED' } });
      const year = await tx.academicYear.create({
        data: {
          tenantId: ctx.tenantId!,
          name: input.name,
          startsOn: toDate(input.startsOn),
          endsOn: toDate(input.endsOn),
          status: input.makeCurrent ? 'CURRENT' : 'PLANNED',
        },
      });
      await tx.gradingScheme.create({
        data: { tenantId: ctx.tenantId!, academicYearId: year.id, version: 1, bands: DEFAULT_GRADING_BANDS },
      });
      await audit(ctx, tx, { action: 'year.create', entity: 'AcademicYear', entityId: year.id, after: input });
      return year;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'An academic year with that name already exists' });
  }
}

/** Making a year CURRENT closes the previous current year (one current year per school). */
export async function updateYear(ctx: AuthedContext, id: string, input: z.infer<typeof updateYearSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.academicYear.findUnique({ where: { id } });
      if (!before) throw notFound('Academic year');
      if (input.status === 'CURRENT' && before.status !== 'CURRENT') {
        await tx.academicYear.updateMany({ where: { status: 'CURRENT', NOT: { id } }, data: { status: 'CLOSED' } });
      }
      const after = await tx.academicYear.update({
        where: { id },
        data: {
          name: input.name,
          status: input.status,
          startsOn: input.startsOn ? toDate(input.startsOn) : undefined,
          endsOn: input.endsOn ? toDate(input.endsOn) : undefined,
        },
      });
      if (after.endsOn <= after.startsOn) throw new AppError('VALIDATION_FAILED', 'End date must be after start date');
      await audit(ctx, tx, {
        action: 'year.update',
        entity: 'AcademicYear',
        entityId: id,
        before: { name: before.name, status: before.status },
        after: input,
      });
      return after;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'An academic year with that name already exists' });
  }
}

export const copyStructureSchema = z.object({
  fromYearId: z.string().uuid(),
  copyIncharges: z.boolean().default(true),
});

/** Copies classes, sections and class subjects from another year (skipping names that already exist). */
export async function copyStructure(ctx: AuthedContext, toYearId: string, input: z.infer<typeof copyStructureSchema>) {
  if (toYearId === input.fromYearId) throw new AppError('VALIDATION_FAILED', 'Choose a different year to copy from');
  return inTenant(
    ctx,
    async (tx) => {
      const [from, to] = await Promise.all([
        tx.academicYear.findUnique({
          where: { id: input.fromYearId },
          include: { classes: { include: { sections: true, subjects: true } } },
        }),
        tx.academicYear.findUnique({ where: { id: toYearId }, include: { classes: true } }),
      ]);
      if (!from || !to) throw notFound('Academic year');
      const existing = new Set(to.classes.map((c) => c.name));
      let classes = 0;
      let sections = 0;
      for (const c of from.classes) {
        if (existing.has(c.name)) continue;
        const created = await tx.class.create({
          data: {
            tenantId: ctx.tenantId!,
            academicYearId: toYearId,
            name: c.name,
            gradeLevel: c.gradeLevel,
            sections: {
              create: c.sections.map((s) => ({
                tenantId: ctx.tenantId!,
                name: s.name,
                capacity: s.capacity,
                classTeacherId: input.copyIncharges ? s.classTeacherId : null,
              })),
            },
            subjects: { create: c.subjects.map((cs) => ({ tenantId: ctx.tenantId!, subjectId: cs.subjectId })) },
          },
        });
        classes++;
        sections += c.sections.length;
        void created;
      }
      await audit(ctx, tx, {
        action: 'year.copy_structure',
        entity: 'AcademicYear',
        entityId: toYearId,
        metadata: { fromYearId: input.fromYearId, classes, sections },
      });
      return { classes, sections };
    },
    30000,
  );
}

// ── Classes & sections ──────────────────────────────────────────────────────

export async function getStructure(ctx: AuthedContext, yearId: string) {
  return inTenant(ctx, async (tx) => {
    const year = await tx.academicYear.findUnique({ where: { id: yearId } });
    if (!year) throw notFound('Academic year');
    const classes = await tx.class.findMany({
      where: { academicYearId: yearId },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: {
        subjects: { include: { subject: { select: { id: true, name: true } } } },
        sections: {
          orderBy: { name: 'asc' },
          include: {
            classTeacher: { include: { user: { select: { displayName: true } } } },
            _count: { select: { students: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });
    return {
      year: {
        id: year.id,
        name: year.name,
        status: year.status,
        startsOn: isoDate(year.startsOn)!,
        endsOn: isoDate(year.endsOn)!,
      },
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        subjects: c.subjects.map((s) => s.subject).sort((a, b) => a.name.localeCompare(b.name)),
        sections: c.sections.map((s) => ({
          id: s.id,
          name: s.name,
          capacity: s.capacity,
          studentCount: s._count.students,
          classTeacher: s.classTeacher ? { id: s.classTeacher.id, name: s.classTeacher.user.displayName } : null,
        })),
      })),
    };
  });
}

/** Flat list of sections in a year, for pickers. */
export async function listSections(ctx: AuthedContext, yearId?: string) {
  return inTenant(ctx, async (tx) => {
    const year = yearId
      ? { id: yearId }
      : await tx.academicYear.findFirst({ where: { status: 'CURRENT' }, select: { id: true } });
    if (!year) return [];
    const sections = await tx.section.findMany({
      where: { class: { academicYearId: year.id } },
      include: {
        class: { select: { name: true, gradeLevel: true } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
      },
    });
    return sections
      .sort(
        (a, b) =>
          a.class.gradeLevel - b.class.gradeLevel ||
          a.class.name.localeCompare(b.class.name) ||
          a.name.localeCompare(b.name),
      )
      .map((s) => ({
        id: s.id,
        label: `${s.class.name}-${s.name}`,
        className: s.class.name,
        name: s.name,
        gradeLevel: s.class.gradeLevel,
        studentCount: s._count.students,
        capacity: s.capacity,
      }));
  });
}

export const createClassSchema = z.object({
  academicYearId: z.string().uuid(),
  name: name(30),
  gradeLevel: z.number().int().min(-3).max(14),
  sections: z.array(name(10)).max(20).default(['A']),
  subjectIds: z.array(z.string().uuid()).max(40).default([]),
});

export async function createClass(ctx: AuthedContext, input: z.infer<typeof createClassSchema>) {
  const sectionNames = [...new Set(input.sections.map((s) => s.toUpperCase()))];
  try {
    return await inTenant(ctx, async (tx) => {
      const c = await tx.class.create({
        data: {
          tenantId: ctx.tenantId!,
          academicYearId: input.academicYearId,
          name: input.name,
          gradeLevel: input.gradeLevel,
          sections: { create: sectionNames.map((n) => ({ tenantId: ctx.tenantId!, name: n })) },
          subjects: { create: input.subjectIds.map((subjectId) => ({ tenantId: ctx.tenantId!, subjectId })) },
        },
      });
      await audit(ctx, tx, {
        action: 'class.create',
        entity: 'Class',
        entityId: c.id,
        after: { ...input, sections: sectionNames },
      });
      return c;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A class with that name already exists in this year' });
  }
}

export const updateClassSchema = z
  .object({ name: name(30), gradeLevel: z.number().int().min(-3).max(14) })
  .partial()
  .strict();

export async function updateClass(ctx: AuthedContext, id: string, input: z.infer<typeof updateClassSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.class.findUnique({ where: { id } });
      if (!before) throw notFound('Class');
      const after = await tx.class.update({ where: { id }, data: input });
      await audit(ctx, tx, {
        action: 'class.update',
        entity: 'Class',
        entityId: id,
        before: { name: before.name, gradeLevel: before.gradeLevel },
        after: input,
      });
      return after;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A class with that name already exists in this year' });
  }
}

export async function deleteClass(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const c = await tx.class.findUnique({
      where: { id },
      include: { sections: { include: { _count: { select: { students: true } } } } },
    });
    if (!c) throw notFound('Class');
    if (c.sections.some((s) => s._count.students > 0)) {
      throw new AppError('CONFLICT', 'Move or withdraw the students in this class before deleting it');
    }
    await tx.section.deleteMany({ where: { classId: id } });
    await tx.class.delete({ where: { id } });
    await audit(ctx, tx, { action: 'class.delete', entity: 'Class', entityId: id, before: { name: c.name } });
    return { ok: true };
  });
}

export const setClassSubjectsSchema = z.object({ subjectIds: z.array(z.string().uuid()).max(40) });

export async function setClassSubjects(
  ctx: AuthedContext,
  classId: string,
  input: z.infer<typeof setClassSubjectsSchema>,
) {
  try {
    return await inTenant(ctx, async (tx) => {
      const c = await tx.class.findUnique({ where: { id: classId }, include: { subjects: true } });
      if (!c) throw notFound('Class');
      const want = new Set(input.subjectIds);
      const have = new Set(c.subjects.map((s) => s.subjectId));
      const remove = [...have].filter((id) => !want.has(id));
      const add = [...want].filter((id) => !have.has(id));
      if (remove.length) await tx.classSubject.deleteMany({ where: { classId, subjectId: { in: remove } } });
      if (add.length)
        await tx.classSubject.createMany({
          data: add.map((subjectId) => ({ tenantId: ctx.tenantId!, classId, subjectId })),
        });
      await audit(ctx, tx, {
        action: 'class.subjects',
        entity: 'Class',
        entityId: classId,
        metadata: { added: add.length, removed: remove.length },
      });
      return { added: add.length, removed: remove.length };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

export const createSectionSchema = z.object({
  classId: z.string().uuid(),
  name: name(10),
  capacity: z.number().int().min(1).max(200).nullable().optional(),
  classTeacherId: z.string().uuid().nullable().optional(),
});

export async function createSection(ctx: AuthedContext, input: z.infer<typeof createSectionSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const s = await tx.section.create({
        data: {
          tenantId: ctx.tenantId!,
          classId: input.classId,
          name: input.name.toUpperCase(),
          capacity: input.capacity ?? null,
          classTeacherId: input.classTeacherId ?? null,
        },
      });
      await audit(ctx, tx, { action: 'section.create', entity: 'Section', entityId: s.id, after: input });
      return s;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'That section already exists in this class' });
  }
}

export const updateSectionSchema = z
  .object({
    name: name(10),
    capacity: z.number().int().min(1).max(200).nullable(),
    classTeacherId: z.string().uuid().nullable(),
  })
  .partial()
  .strict();

export async function updateSection(ctx: AuthedContext, id: string, input: z.infer<typeof updateSectionSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.section.findUnique({ where: { id } });
      if (!before) throw notFound('Section');
      const after = await tx.section.update({
        where: { id },
        data: { ...input, name: input.name?.toUpperCase() },
      });
      await audit(ctx, tx, {
        action: input.classTeacherId !== undefined ? 'section.incharge' : 'section.update',
        entity: 'Section',
        entityId: id,
        before: { name: before.name, capacity: before.capacity, classTeacherId: before.classTeacherId },
        after: input,
      });
      return after;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'That section already exists in this class' });
  }
}

export async function deleteSection(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const s = await tx.section.findUnique({ where: { id }, include: { _count: { select: { students: true } } } });
    if (!s) throw notFound('Section');
    if (s._count.students > 0)
      throw new AppError('CONFLICT', 'Move or withdraw the students in this section before deleting it');
    await tx.section.delete({ where: { id } });
    await audit(ctx, tx, { action: 'section.delete', entity: 'Section', entityId: id, before: { name: s.name } });
    return { ok: true };
  });
}

// ── Subjects ────────────────────────────────────────────────────────────────

export const subjectSchema = z.object({ name: name(60), code: z.string().trim().max(12).nullable().optional() });
export const updateSubjectSchema = z
  .object({ name: name(60), code: z.string().trim().max(12).nullable(), archived: z.boolean() })
  .partial()
  .strict();

export async function listSubjects(ctx: AuthedContext, includeArchived = false) {
  const rows = await inTenant(ctx, (tx) =>
    tx.subject.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { classes: true, assignments: true } } },
    }),
  );
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    archived: s.archivedAt !== null,
    classCount: s._count.classes,
    teacherCount: s._count.assignments,
  }));
}

export async function createSubject(ctx: AuthedContext, input: z.infer<typeof subjectSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const s = await tx.subject.create({
        data: { tenantId: ctx.tenantId!, name: input.name, code: input.code || null },
      });
      await audit(ctx, tx, { action: 'subject.create', entity: 'Subject', entityId: s.id, after: input });
      return s;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A subject with that name already exists' });
  }
}

export async function updateSubject(ctx: AuthedContext, id: string, input: z.infer<typeof updateSubjectSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.subject.findUnique({ where: { id } });
      if (!before) throw notFound('Subject');
      const after = await tx.subject.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code === undefined ? undefined : input.code || null,
          archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
        },
      });
      await audit(ctx, tx, {
        action: 'subject.update',
        entity: 'Subject',
        entityId: id,
        before: { name: before.name, code: before.code },
        after: input,
      });
      return after;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'A subject with that name already exists' });
  }
}
