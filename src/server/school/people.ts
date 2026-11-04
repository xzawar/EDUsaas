import 'server-only';
import { Prisma, type UserRole } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { normalizeUsername, studentUsername, teacherUsername } from '@/server/auth/username';
import { revokeUserSessions } from '@/server/auth/session';
import {
  DAY_MS,
  audit,
  friendlyDbError,
  inTenant,
  isoDate,
  sectionLabel,
  teacherScope,
  toDate,
} from '@/server/school/common';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-04-01');
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+0-9][0-9 -]{6,19}$/, 'Enter a valid phone number');
const optional = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional();
export const RESTORE_WINDOW_DAYS = 30;

async function tenantPrefix(tx: TenantTx) {
  return (await tx.tenant.findFirstOrThrow({ select: { prefix: true } })).prefix;
}

/** Creates a login with a one-time temporary password (forced change at first sign-in, spec §9.3). */
async function createLogin(
  tx: TenantTx,
  data: { tenantId: string; role: UserRole; displayName: string; username?: string; email?: string },
) {
  const temporaryPassword = generateTemporaryPassword();
  const user = await tx.user.create({
    data: {
      tenantId: data.tenantId,
      role: data.role,
      displayName: data.displayName,
      username: data.username ?? null,
      usernameNormalized: data.username ? normalizeUsername(data.username) : null,
      email: data.email?.toLowerCase() ?? null,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
    },
  });
  return { user, temporaryPassword };
}

async function nextTeacherUsername(tx: TenantTx, prefix: string, displayName: string) {
  for (let n = 1; n < 500; n++) {
    const candidate = teacherUsername({ prefix, displayName, sequence: n });
    const taken = await tx.user.findFirst({
      where: { usernameNormalized: normalizeUsername(candidate) },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new AppError('CONFLICT', 'Could not generate a username');
}

async function setUsername(tx: TenantTx, userId: string, username: string) {
  await tx.user.update({ where: { id: userId }, data: { username, usernameNormalized: normalizeUsername(username) } });
}

// ════════════════════════════════════════════════════════════════════════════
// Teachers
// ════════════════════════════════════════════════════════════════════════════

export const createTeacherSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  employeeNo: optional(z.string().trim().max(30)),
  phone: optional(phone),
  qualification: optional(z.string().trim().max(120)),
  joinedOn: optional(dateStr),
});
export const updateTeacherSchema = createTeacherSchema.partial().strict();

export const listTeachersQuery = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export async function listTeachers(ctx: AuthedContext, query: z.infer<typeof listTeachersQuery>) {
  return inTenant(ctx, async (tx) => {
    const rows = await tx.teacher.findMany({
      where: query.q
        ? {
            OR: [
              { user: { displayName: { contains: query.q, mode: 'insensitive' } } },
              { user: { username: { contains: query.q, mode: 'insensitive' } } },
              { employeeNo: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {},
      include: {
        user: { select: { displayName: true, username: true, status: true, lastLoginAt: true } },
        assignments: {
          select: {
            subject: { select: { name: true } },
            section: { select: { class: { select: { academicYear: { select: { status: true } } } } } },
          },
        },
        inchargeOf: {
          where: { class: { academicYear: { status: 'CURRENT' } } },
          select: { name: true, class: { select: { name: true } } },
        },
      },
      orderBy: [{ user: { displayName: 'asc' } }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((t) => {
      const current = t.assignments.filter((a) => a.section.class.academicYear.status === 'CURRENT');
      return {
        id: t.id,
        name: t.user.displayName,
        username: t.user.username,
        status: t.user.status,
        lastLoginAt: t.user.lastLoginAt,
        employeeNo: t.employeeNo,
        phone: t.phone,
        subjects: [...new Set(current.map((a) => a.subject.name))].sort(),
        assignmentCount: current.length,
        inchargeOf: t.inchargeOf.map(sectionLabel),
      };
    });
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  });
}

export async function getTeacher(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const t = await tx.teacher.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            status: true,
            lastLoginAt: true,
            mustChangePassword: true,
          },
        },
        assignments: {
          where: { section: { class: { academicYear: { status: 'CURRENT' } } } },
          include: {
            subject: { select: { id: true, name: true } },
            section: { include: { class: { select: { name: true, gradeLevel: true } } } },
          },
        },
        inchargeOf: {
          where: { class: { academicYear: { status: 'CURRENT' } } },
          include: {
            class: { select: { name: true } },
            _count: { select: { students: { where: { status: 'ACTIVE' } } } },
          },
        },
      },
    });
    if (!t) throw notFound('Teacher');
    return {
      id: t.id,
      userId: t.user.id,
      name: t.user.displayName,
      username: t.user.username,
      status: t.user.status,
      lastLoginAt: t.user.lastLoginAt,
      pendingFirstLogin: t.user.mustChangePassword,
      employeeNo: t.employeeNo,
      phone: t.phone,
      qualification: t.qualification,
      joinedOn: isoDate(t.joinedOn),
      assignments: t.assignments
        .map((a) => ({
          sectionId: a.sectionId,
          subjectId: a.subjectId,
          section: sectionLabel(a.section),
          subject: a.subject.name,
          gradeLevel: a.section.class.gradeLevel,
        }))
        .sort(
          (a, b) =>
            a.gradeLevel - b.gradeLevel || a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject),
        ),
      inchargeOf: t.inchargeOf.map((s) => ({ id: s.id, label: sectionLabel(s), studentCount: s._count.students })),
    };
  });
}

export async function createTeacher(ctx: AuthedContext, input: z.infer<typeof createTeacherSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const username = await nextTeacherUsername(tx, await tenantPrefix(tx), input.displayName);
      const { user, temporaryPassword } = await createLogin(tx, {
        tenantId: ctx.tenantId!,
        role: 'TEACHER',
        displayName: input.displayName,
        username,
      });
      const teacher = await tx.teacher.create({
        data: {
          tenantId: ctx.tenantId!,
          userId: user.id,
          employeeNo: input.employeeNo || null,
          phone: input.phone || null,
          qualification: input.qualification || null,
          joinedOn: input.joinedOn ? toDate(input.joinedOn) : null,
        },
      });
      await audit(ctx, tx, {
        action: 'teacher.create',
        entity: 'Teacher',
        entityId: teacher.id,
        after: { ...input, username },
      });
      return { id: teacher.id, name: user.displayName, username, temporaryPassword };
    });
  } catch (e) {
    friendlyDbError(e, { employee_no: 'That employee number is already used' });
  }
}

export async function updateTeacher(ctx: AuthedContext, id: string, input: z.infer<typeof updateTeacherSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await tx.teacher.findUnique({ where: { id }, include: { user: true } });
      if (!before) throw notFound('Teacher');
      if (input.displayName)
        await tx.user.update({ where: { id: before.userId }, data: { displayName: input.displayName } });
      await tx.teacher.update({
        where: { id },
        data: {
          employeeNo: input.employeeNo === undefined ? undefined : input.employeeNo || null,
          phone: input.phone === undefined ? undefined : input.phone || null,
          qualification: input.qualification === undefined ? undefined : input.qualification || null,
          joinedOn: input.joinedOn === undefined ? undefined : input.joinedOn ? toDate(input.joinedOn) : null,
        },
      });
      await audit(ctx, tx, {
        action: 'teacher.update',
        entity: 'Teacher',
        entityId: id,
        before: { displayName: before.user.displayName, employeeNo: before.employeeNo, phone: before.phone },
        after: input,
      });
      return { ok: true };
    });
  } catch (e) {
    friendlyDbError(e, { employee_no: 'That employee number is already used' });
  }
}

export const setAssignmentsSchema = z.object({
  academicYearId: z.string().uuid(),
  assignments: z.array(z.object({ sectionId: z.string().uuid(), subjectId: z.string().uuid() })).max(80),
});

/** Replaces a teacher's assignments within one academic year (other years are untouched). */
export async function setAssignments(
  ctx: AuthedContext,
  teacherId: string,
  input: z.infer<typeof setAssignmentsSchema>,
) {
  try {
    return await inTenant(ctx, async (tx) => {
      const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher) throw notFound('Teacher');
      const sections = await tx.section.findMany({
        where: { id: { in: input.assignments.map((a) => a.sectionId) } },
        select: { id: true, class: { select: { academicYearId: true } } },
      });
      if (
        sections.some((s) => s.class.academicYearId !== input.academicYearId) ||
        sections.length !== new Set(input.assignments.map((a) => a.sectionId)).size
      ) {
        throw new AppError('VALIDATION_FAILED', 'Every section must belong to the selected academic year');
      }
      const existing = await tx.teacherAssignment.findMany({
        where: { teacherId, section: { class: { academicYearId: input.academicYearId } } },
      });
      const key = (a: { sectionId: string; subjectId: string }) => `${a.sectionId}:${a.subjectId}`;
      const want = new Map(input.assignments.map((a) => [key(a), a]));
      const remove = existing.filter((e) => !want.has(key(e)));
      const have = new Set(existing.map(key));
      const add = [...want.values()].filter((a) => !have.has(key(a)));
      if (remove.length) await tx.teacherAssignment.deleteMany({ where: { id: { in: remove.map((r) => r.id) } } });
      if (add.length)
        await tx.teacherAssignment.createMany({ data: add.map((a) => ({ ...a, tenantId: ctx.tenantId!, teacherId })) });
      await audit(ctx, tx, {
        action: 'teacher.assignments',
        entity: 'Teacher',
        entityId: teacherId,
        metadata: { academicYearId: input.academicYearId, added: add.length, removed: remove.length },
      });
      return { added: add.length, removed: remove.length };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Staff accounts & account administration
// ════════════════════════════════════════════════════════════════════════════

export const createStaffSchema = z.object({
  role: z.enum(['PRINCIPAL', 'ADMISSIONS_OFFICER']),
  displayName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
});

export async function createStaff(ctx: AuthedContext, input: z.infer<typeof createStaffSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const { user, temporaryPassword } = await createLogin(tx, {
        tenantId: ctx.tenantId!,
        role: input.role,
        displayName: input.displayName,
        email: input.email,
      });
      await audit(ctx, tx, { action: 'staff.create', entity: 'User', entityId: user.id, after: input });
      return { id: user.id, email: user.email, temporaryPassword };
    });
  } catch (e) {
    friendlyDbError(e, { email: 'That email is already in use' });
  }
}

/**
 * Admin credential reset (spec §3.5): issues a temporary password, forces a change, and signs the user out
 * everywhere. School Admin can reset anyone but themselves; holders of students.reset_password only students.
 */
export async function resetUserPassword(ctx: AuthedContext, userId: string) {
  if (userId === ctx.user.id) throw new AppError('VALIDATION_FAILED', 'Use "Change password" for your own account');
  const result = await inTenant(ctx, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!target) throw notFound('User');
    const allowed = ctx.can('users.manage')
      ? target.role !== 'SCHOOL_ADMIN'
      : target.role === 'STUDENT' && ctx.can('students.reset_password');
    if (!allowed) throw forbidden('You cannot reset this account');
    const temporaryPassword = generateTemporaryPassword();
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
    await audit(ctx, tx, {
      action: 'user.reset_password',
      entity: 'User',
      entityId: userId,
      metadata: { role: target.role },
    });
    return { username: target.username ?? target.email, displayName: target.displayName, temporaryPassword };
  });
  await revokeUserSessions(userId);
  return result;
}

export const setUserStatusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

export async function setUserStatus(ctx: AuthedContext, userId: string, input: z.infer<typeof setUserStatusSchema>) {
  if (userId === ctx.user.id) throw new AppError('VALIDATION_FAILED', 'You cannot change your own account status');
  await inTenant(ctx, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!target) throw notFound('User');
    if (target.role === 'SCHOOL_ADMIN')
      throw forbidden('The School Admin account can only be changed by the Platform Owner');
    if (target.role === 'STUDENT') throw new AppError('VALIDATION_FAILED', 'Use withdraw/restore for students');
    await tx.user.update({ where: { id: userId }, data: { status: input.status } });
    await audit(ctx, tx, {
      action: 'user.status',
      entity: 'User',
      entityId: userId,
      before: { status: target.status },
      after: input,
    });
  });
  if (input.status === 'DISABLED') await revokeUserSessions(userId);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// Students
// ════════════════════════════════════════════════════════════════════════════

export const listStudentsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  sectionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'WITHDRAWN', 'GRADUATED']).default('ACTIVE'),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Role-scoped student search (spec §4): teachers see only their sections; staff see the whole school.
 * Every row carries class/section + username so same-name students are never ambiguous.
 */
export async function listStudents(ctx: AuthedContext, query: z.infer<typeof listStudentsQuery>) {
  return inTenant(ctx, async (tx) => {
    let scopeIds: string[] | null = null;
    if (ctx.user.role === 'TEACHER') scopeIds = (await teacherScope(tx, ctx.user.id)).sectionIds;
    const q = query.q;
    const digits = q?.replace(/\D/g, '');
    const where: Prisma.StudentWhereInput = {
      status: query.status,
      ...(scopeIds ? { sectionId: { in: scopeIds } } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(query.classId ? { section: { classId: query.classId } } : {}),
      ...(q
        ? {
            OR: [
              { user: { displayName: { contains: q, mode: 'insensitive' } } },
              { user: { usernameNormalized: { contains: normalizeUsername(q) } } },
              { admissionNo: { contains: q, mode: 'insensitive' } },
              ...(digits && digits.length >= 4 && ctx.user.role !== 'TEACHER'
                ? [{ guardianPhone: { contains: digits } }]
                : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      tx.student.findMany({
        where,
        include: {
          user: { select: { displayName: true, username: true, lastLoginAt: true } },
          section: { select: { id: true, name: true, class: { select: { name: true, gradeLevel: true } } } },
        },
        orderBy: [
          { section: { class: { gradeLevel: 'asc' } } },
          { section: { name: 'asc' } },
          { rollNumber: 'asc' },
          { id: 'asc' },
        ],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      tx.student.count({ where }),
    ]);
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((s) => ({
      id: s.id,
      name: s.user.displayName,
      username: s.user.username,
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
      section: s.section ? sectionLabel(s.section) : 'Unplaced',
      sectionId: s.section?.id ?? null,
      gender: s.gender,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      status: s.status,
      withdrawnAt: s.withdrawnAt,
      lastLoginAt: s.user.lastLoginAt,
    }));
    return { items, total, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  });
}

async function loadScopedStudent(ctx: AuthedContext, tx: TenantTx, id: string) {
  const s = await tx.student.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          status: true,
          lastLoginAt: true,
          mustChangePassword: true,
        },
      },
      section: {
        include: {
          class: { select: { id: true, name: true, gradeLevel: true, academicYear: { select: { name: true } } } },
          classTeacher: { include: { user: { select: { displayName: true } } } },
        },
      },
    },
  });
  if (s && ctx.user.role === 'TEACHER') {
    const scope = await teacherScope(tx, ctx.user.id);
    if (!s.sectionId || !scope.sectionIds.includes(s.sectionId)) return null;
  }
  return s;
}

export async function getStudent(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const s = await loadScopedStudent(ctx, tx, id);
    if (!s) {
      await audit(ctx, tx, { action: 'access.not_found', entity: 'Student', entityId: id, outcome: 'denied' });
      return null;
    }
    const restoreUntil = s.withdrawnAt ? new Date(s.withdrawnAt.getTime() + RESTORE_WINDOW_DAYS * DAY_MS) : null;
    return {
      id: s.id,
      userId: s.user.id,
      name: s.user.displayName,
      username: s.user.username,
      accountStatus: s.user.status,
      pendingFirstLogin: s.user.mustChangePassword,
      lastLoginAt: s.user.lastLoginAt,
      status: s.status,
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
      gender: s.gender,
      dateOfBirth: isoDate(s.dateOfBirth),
      admittedOn: isoDate(s.admittedOn),
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      address: s.address,
      withdrawnAt: s.withdrawnAt,
      restoreUntil,
      canRestore: s.status === 'WITHDRAWN' && restoreUntil !== null && restoreUntil.getTime() > Date.now(),
      section: s.section
        ? {
            id: s.section.id,
            label: sectionLabel(s.section),
            classId: s.section.class.id,
            year: s.section.class.academicYear.name,
            classTeacher: s.section.classTeacher?.user.displayName ?? null,
          }
        : null,
    };
  }).then((r) => {
    if (!r) throw notFound('Student');
    return r;
  });
}

export const createStudentSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  sectionId: z.string().uuid(),
  admissionNo: optional(z.string().trim().max(30)),
  gender: optional(z.enum(['MALE', 'FEMALE', 'OTHER'])),
  dateOfBirth: optional(dateStr),
  admittedOn: optional(dateStr),
  guardianName: optional(z.string().trim().max(120)),
  guardianPhone: optional(phone),
  address: optional(z.string().trim().max(300)),
});

export const updateStudentSchema = createStudentSchema.omit({ sectionId: true }).partial().strict();

async function placeInSection(tx: TenantTx, sectionId: string) {
  const section = await tx.section.findUnique({
    where: { id: sectionId },
    include: { class: { include: { academicYear: { select: { status: true } } } } },
  });
  if (!section) throw notFound('Section');
  if (section.class.academicYear.status === 'CLOSED')
    throw new AppError('VALIDATION_FAILED', 'That section belongs to a closed academic year');
  // Atomic: takes a row lock on the section, so concurrent admissions never get the same roll number.
  const updated = await tx.section.update({ where: { id: sectionId }, data: { nextRollNumber: { increment: 1 } } });
  return { section, rollNumber: updated.nextRollNumber - 1 };
}

export async function createStudent(ctx: AuthedContext, input: z.infer<typeof createStudentSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const prefix = await tenantPrefix(tx);
      const { section, rollNumber } = await placeInSection(tx, input.sectionId);
      const username = studentUsername({
        prefix,
        className: section.class.name,
        sectionName: section.name,
        displayName: input.displayName,
        rollNumber,
      });
      const { user, temporaryPassword } = await createLogin(tx, {
        tenantId: ctx.tenantId!,
        role: 'STUDENT',
        displayName: input.displayName,
        username,
      });
      const student = await tx.student.create({
        data: {
          tenantId: ctx.tenantId!,
          userId: user.id,
          sectionId: section.id,
          rollNumber,
          admissionNo: input.admissionNo || null,
          gender: input.gender ?? null,
          dateOfBirth: input.dateOfBirth ? toDate(input.dateOfBirth) : null,
          admittedOn: input.admittedOn ? toDate(input.admittedOn) : undefined,
          guardianName: input.guardianName || null,
          guardianPhone: input.guardianPhone || null,
          address: input.address || null,
        },
      });
      await audit(ctx, tx, {
        action: 'student.create',
        entity: 'Student',
        entityId: student.id,
        after: { displayName: input.displayName, section: sectionLabel(section), rollNumber, username },
      });
      return {
        id: student.id,
        name: input.displayName,
        username,
        rollNumber,
        section: sectionLabel(section),
        temporaryPassword,
      };
    });
  } catch (e) {
    friendlyDbError(e, {
      admission_no: 'That admission number is already used',
      username: 'Username clash, try again',
    });
  }
}

const GUARDIAN_FIELDS = ['guardianName', 'guardianPhone'] as const;

export async function updateStudent(ctx: AuthedContext, id: string, input: z.infer<typeof updateStudentSchema>) {
  // Spec §5.5: guardian details are editable by the School Admin only.
  if (ctx.user.role !== 'SCHOOL_ADMIN' && GUARDIAN_FIELDS.some((f) => input[f] !== undefined)) {
    throw forbidden('Only the School Admin can edit guardian details');
  }
  try {
    return await inTenant(ctx, async (tx) => {
      const before = await loadScopedStudent(ctx, tx, id);
      if (!before) throw notFound('Student');
      if (input.displayName && input.displayName !== before.user.displayName) {
        await tx.user.update({ where: { id: before.userId }, data: { displayName: input.displayName } });
      }
      const opt = <T>(v: T | null | undefined, map: (x: T) => unknown = (x) => x) =>
        v === undefined ? undefined : v === null || v === '' ? null : map(v);
      await tx.student.update({
        where: { id },
        data: {
          admissionNo: opt(input.admissionNo) as string | null | undefined,
          gender: input.gender === undefined ? undefined : input.gender,
          dateOfBirth: opt(input.dateOfBirth, toDate) as Date | null | undefined,
          admittedOn: input.admittedOn ? toDate(input.admittedOn) : undefined,
          guardianName: opt(input.guardianName) as string | null | undefined,
          guardianPhone: opt(input.guardianPhone) as string | null | undefined,
          address: opt(input.address) as string | null | undefined,
        },
      });
      const changed = Object.keys(input);
      await audit(ctx, tx, {
        action: GUARDIAN_FIELDS.some((f) => changed.includes(f)) ? 'student.update_guardian' : 'student.update',
        entity: 'Student',
        entityId: id,
        before: Object.fromEntries(
          changed.map((k) => [
            k,
            k === 'displayName' ? before.user.displayName : (before as Record<string, unknown>)[k],
          ]),
        ),
        after: input,
      });
      return { ok: true };
    });
  } catch (e) {
    friendlyDbError(e, { admission_no: 'That admission number is already used' });
  }
}

export const transferSchema = z.object({ sectionId: z.string().uuid() });

/** Mid-year section transfer (spec §5.3): new roll number at the end of the target section, username regenerated. */
export async function transferStudent(ctx: AuthedContext, id: string, input: z.infer<typeof transferSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const s = await tx.student.findUnique({
        where: { id },
        include: { user: true, section: { include: { class: true } } },
      });
      if (!s) throw notFound('Student');
      if (s.status !== 'ACTIVE') throw new AppError('VALIDATION_FAILED', 'Only active students can be transferred');
      if (s.sectionId === input.sectionId)
        throw new AppError('VALIDATION_FAILED', 'The student is already in that section');
      const { section, rollNumber } = await placeInSection(tx, input.sectionId);
      const username = studentUsername({
        prefix: await tenantPrefix(tx),
        className: section.class.name,
        sectionName: section.name,
        displayName: s.user.displayName,
        rollNumber,
      });
      await tx.student.update({ where: { id }, data: { sectionId: section.id, rollNumber } });
      await setUsername(tx, s.userId, username);
      await audit(ctx, tx, {
        action: 'student.transfer',
        entity: 'Student',
        entityId: id,
        before: {
          section: s.section ? sectionLabel(s.section) : null,
          rollNumber: s.rollNumber,
          username: s.user.username,
        },
        after: { section: sectionLabel(section), rollNumber, username },
      });
      return { username, rollNumber, section: sectionLabel(section) };
    });
  } catch (e) {
    friendlyDbError(e);
  }
}

/** Soft delete with a 30-day restore window (spec §5.1). Signs the student out everywhere. */
export async function withdrawStudent(ctx: AuthedContext, id: string) {
  const userId = await inTenant(ctx, async (tx) => {
    const s = await tx.student.findUnique({ where: { id } });
    if (!s) throw notFound('Student');
    if (s.status !== 'ACTIVE') throw new AppError('VALIDATION_FAILED', 'This student is not active');
    await tx.student.update({ where: { id }, data: { status: 'WITHDRAWN', withdrawnAt: new Date() } });
    await tx.user.update({ where: { id: s.userId }, data: { status: 'DISABLED' } });
    await audit(ctx, tx, {
      action: 'student.withdraw',
      entity: 'Student',
      entityId: id,
      before: { status: s.status },
      after: { status: 'WITHDRAWN' },
    });
    return s.userId;
  });
  await revokeUserSessions(userId);
  return { ok: true, restoreWithinDays: RESTORE_WINDOW_DAYS };
}

export async function restoreStudent(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const s = await tx.student.findUnique({ where: { id } });
    if (!s) throw notFound('Student');
    if (s.status !== 'WITHDRAWN' || !s.withdrawnAt)
      throw new AppError('VALIDATION_FAILED', 'This student is not withdrawn');
    if (Date.now() - s.withdrawnAt.getTime() > RESTORE_WINDOW_DAYS * DAY_MS) {
      throw new AppError('VALIDATION_FAILED', `The ${RESTORE_WINDOW_DAYS}-day restore window has passed`);
    }
    await tx.student.update({ where: { id }, data: { status: 'ACTIVE', withdrawnAt: null } });
    await tx.user.update({ where: { id: s.userId }, data: { status: 'ACTIVE' } });
    await audit(ctx, tx, { action: 'student.restore', entity: 'Student', entityId: id, after: { status: 'ACTIVE' } });
    return { ok: true };
  });
}

export async function resetStudentPassword(ctx: AuthedContext, id: string) {
  const userId = await inTenant(ctx, async (tx) => {
    const s = await loadScopedStudent(ctx, tx, id);
    if (!s) throw notFound('Student');
    return s.userId;
  });
  return resetUserPassword(ctx, userId);
}

// ── Roll-number renumbering (spec §3.3) ─────────────────────────────────────

async function renumberPlan(tx: TenantTx, sectionId: string) {
  const section = await tx.section.findUnique({ where: { id: sectionId }, include: { class: true } });
  if (!section) throw notFound('Section');
  const students = await tx.student.findMany({
    where: { sectionId, status: 'ACTIVE' },
    include: { user: { select: { id: true, displayName: true, username: true } } },
    orderBy: [{ rollNumber: 'asc' }],
  });
  const prefix = await tenantPrefix(tx);
  const rows = students.map((s, i) => {
    const newRoll = i + 1;
    return {
      studentId: s.id,
      userId: s.user.id,
      name: s.user.displayName,
      oldRoll: s.rollNumber,
      newRoll,
      oldUsername: s.user.username,
      newUsername: studentUsername({
        prefix,
        className: section.class.name,
        sectionName: section.name,
        displayName: s.user.displayName,
        rollNumber: newRoll,
      }),
    };
  });
  return { section, rows, changes: rows.filter((r) => r.oldRoll !== r.newRoll) };
}

async function assertCanRenumber(ctx: AuthedContext, tx: TenantTx, sectionId: string) {
  if (ctx.can('structure.manage')) return;
  const scope = await teacherScope(tx, ctx.user.id);
  if (!scope.inchargeSectionIds.includes(sectionId))
    throw forbidden('Only the School Admin or this section’s Class Incharge can renumber');
}

export async function previewRenumber(ctx: AuthedContext, sectionId: string) {
  return inTenant(ctx, async (tx) => {
    await assertCanRenumber(ctx, tx, sectionId);
    const { section, changes, rows } = await renumberPlan(tx, sectionId);
    return { section: sectionLabel(section), total: rows.length, changes: changes.map(({ userId: _u, ...r }) => r) };
  });
}

export const renumberSchema = z.object({ confirm: z.literal(true), expectedChanges: z.number().int().min(0) });

/** Resequences 1..n with mandatory confirmation; usernames change; full before/after mapping is audited. */
export async function applyRenumber(ctx: AuthedContext, sectionId: string, input: z.infer<typeof renumberSchema>) {
  return inTenant(
    ctx,
    async (tx) => {
      await assertCanRenumber(ctx, tx, sectionId);
      const { section, rows, changes } = await renumberPlan(tx, sectionId);
      if (changes.length !== input.expectedChanges) {
        throw new AppError('CONFLICT', 'The class list changed since you previewed it. Review the changes again.');
      }
      // Two passes avoid unique (section_id, roll_number) clashes mid-update.
      for (const r of changes)
        await tx.student.update({ where: { id: r.studentId }, data: { rollNumber: 10000 + r.newRoll } });
      for (const r of changes) {
        await tx.student.update({ where: { id: r.studentId }, data: { rollNumber: r.newRoll } });
        await setUsername(tx, r.userId, r.newUsername);
      }
      await tx.section.update({ where: { id: sectionId }, data: { nextRollNumber: rows.length + 1 } });
      await audit(ctx, tx, {
        action: 'section.renumber',
        entity: 'Section',
        entityId: sectionId,
        metadata: {
          section: sectionLabel(section),
          mapping: changes.map((c) => ({
            student: c.studentId,
            roll: [c.oldRoll, c.newRoll],
            username: [c.oldUsername, c.newUsername],
          })),
        },
      });
      return { changed: changes.length };
    },
    30000,
  );
}
