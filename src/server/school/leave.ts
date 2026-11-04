import 'server-only';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import {
  audit,
  friendlyDbError,
  inTenant,
  isoDate,
  schoolClock,
  sectionLabel,
  teacherScope,
  toDate,
} from '@/server/school/common';
import { notify } from '@/server/school/notifications';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-03');
const DEFAULT_TYPES = [
  { name: 'Sick leave', forStudents: true, forStaff: true },
  { name: 'Casual leave', forStudents: true, forStaff: true },
  { name: 'Family emergency', forStudents: true, forStaff: true },
  { name: 'Official duty', forStudents: false, forStaff: true },
];

async function ensureTypes(tx: TenantTx, tenantId: string) {
  if ((await tx.leaveType.count()) === 0) {
    await tx.leaveType.createMany({ data: DEFAULT_TYPES.map((t) => ({ ...t, tenantId })), skipDuplicates: true });
  }
}

export async function leaveTypes(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    await ensureTypes(tx, ctx.tenantId!);
    const forStudent = ctx.user.role === 'STUDENT';
    return tx.leaveType.findMany({
      where: { archivedAt: null, ...(forStudent ? { forStudents: true } : { forStaff: true }) },
      orderBy: { name: 'asc' },
    });
  });
}

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(2).max(60),
  forStudents: z.boolean().default(true),
  forStaff: z.boolean().default(true),
});

export async function createLeaveType(ctx: AuthedContext, input: z.infer<typeof leaveTypeSchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const t = await tx.leaveType.create({ data: { ...input, tenantId: ctx.tenantId! } });
      await audit(ctx, tx, { action: 'leave_type.create', entity: 'LeaveType', entityId: t.id, after: input });
      return t;
    });
  } catch (e) {
    friendlyDbError(e, { name: 'That leave type already exists' });
  }
}

export const applySchema = z
  .object({
    typeId: z.string().uuid(),
    fromDate: dateStr,
    toDate: dateStr,
    reason: z.string().trim().min(3, 'Please give a short reason').max(1000),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'End date must be on or after the start date', path: ['toDate'] });

/** Spec §2.4 / §2.6: Teachers, Principal and Students apply for their own leave. */
export async function applyLeave(ctx: AuthedContext, input: z.infer<typeof applySchema>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    if (input.toDate < clock.today) throw new AppError('VALIDATION_FAILED', 'Leave can’t end in the past');
    const type = await tx.leaveType.findUnique({ where: { id: input.typeId } });
    const isStudent = ctx.user.role === 'STUDENT';
    if (!type || type.archivedAt || (isStudent ? !type.forStudents : !type.forStaff))
      throw new AppError('VALIDATION_FAILED', 'Choose a valid leave type');
    const student = isStudent ? await tx.student.findUnique({ where: { userId: ctx.user.id } }) : null;
    const overlap = await tx.leaveRequest.findFirst({
      where: {
        applicantId: ctx.user.id,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toDate(input.toDate) },
        toDate: { gte: toDate(input.fromDate) },
      },
    });
    if (overlap) throw new AppError('CONFLICT', 'You already have a leave request for some of these days');
    const req = await tx.leaveRequest.create({
      data: {
        tenantId: ctx.tenantId!,
        applicantId: ctx.user.id,
        studentId: student?.id ?? null,
        typeId: input.typeId,
        fromDate: toDate(input.fromDate),
        toDate: toDate(input.toDate),
        reason: input.reason,
      },
    });
    await audit(ctx, tx, {
      action: 'leave.apply',
      entity: 'LeaveRequest',
      entityId: req.id,
      after: { ...input, type: type.name },
    });
    // Tell the first approver.
    const approverIds = await firstApprovers(tx, ctx, student?.sectionId ?? null);
    await notify(tx, ctx.tenantId!, approverIds, {
      kind: 'leave',
      title: 'New leave request',
      body: `${ctx.user.displayName} asked for ${type.name.toLowerCase()} (${input.fromDate} – ${input.toDate}).`,
      link: '/staff/leave?tab=approve',
    });
    return req;
  });
}

async function firstApprovers(tx: TenantTx, ctx: AuthedContext, sectionId: string | null): Promise<string[]> {
  if (sectionId) {
    const s = await tx.section.findUnique({
      where: { id: sectionId },
      include: { classTeacher: { select: { userId: true } } },
    });
    if (s?.classTeacher) return [s.classTeacher.userId];
  }
  const admins = await tx.user.findMany({
    where: {
      role: { in: ctx.user.role === 'STUDENT' ? ['SCHOOL_ADMIN'] : ['SCHOOL_ADMIN', 'PRINCIPAL'] },
      status: 'ACTIVE',
      deletedAt: null,
    },
    select: { id: true },
  });
  return admins.map((a) => a.id).filter((id) => id !== ctx.user.id);
}

const include = {
  applicant: { select: { id: true, displayName: true, role: true } },
  type: { select: { name: true } },
  student: { select: { id: true, section: { select: { id: true, name: true, class: { select: { name: true } } } } } },
} satisfies Prisma.LeaveRequestInclude;
type Row = Prisma.LeaveRequestGetPayload<{ include: typeof include }>;

function shape(r: Row, ageOutHours: number, now: Date) {
  const escalated =
    r.status === 'PENDING' && !!r.studentId && now.getTime() - r.createdAt.getTime() > ageOutHours * 3600_000;
  const days = Math.round((r.toDate.getTime() - r.fromDate.getTime()) / 86400000) + 1;
  return {
    id: r.id,
    applicant: r.applicant.displayName,
    applicantId: r.applicant.id,
    applicantRole: r.applicant.role,
    section: r.student?.section ? sectionLabel(r.student.section) : null,
    type: r.type.name,
    fromDate: isoDate(r.fromDate)!,
    toDate: isoDate(r.toDate)!,
    days,
    reason: r.reason,
    status: r.status,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    escalated,
  };
}

export async function myLeave(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const rows = await tx.leaveRequest.findMany({
      where: { applicantId: ctx.user.id },
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => shape(r, clock.leaveAgeOutHours, clock.now));
  });
}

/**
 * Who decides (decision D5): a student's Class Incharge, or the School Admin (always; and the only one once a
 * student request has aged out). Staff requests: the Principal (if allowed) or the School Admin. Never oneself.
 */
async function canDecide(
  ctx: AuthedContext,
  tx: TenantTx,
  r: { applicantId: string; studentId: string | null; student: { section: { id: string } | null } | null },
  escalated: boolean,
) {
  if (r.applicantId === ctx.user.id) return false;
  if (ctx.user.role === 'SCHOOL_ADMIN') return true;
  if (r.studentId) {
    if (escalated) return false;
    const scope = await teacherScope(tx, ctx.user.id);
    return !!r.student?.section && scope.inchargeSectionIds.includes(r.student.section.id);
  }
  return ctx.user.role === 'PRINCIPAL' && ctx.can('leave.approve');
}

export async function approvalQueue(ctx: AuthedContext, status: 'PENDING' | 'DECIDED' = 'PENDING') {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const scope = ctx.user.role === 'TEACHER' ? await teacherScope(tx, ctx.user.id) : null;
    const where: Prisma.LeaveRequestWhereInput = {
      applicantId: { not: ctx.user.id },
      status: status === 'PENDING' ? 'PENDING' : { in: ['APPROVED', 'REJECTED'] },
      ...(ctx.user.role === 'SCHOOL_ADMIN'
        ? {}
        : ctx.user.role === 'PRINCIPAL'
          ? ctx.can('leave.approve')
            ? { studentId: null }
            : { id: '00000000-0000-0000-0000-000000000000' }
          : { student: { sectionId: { in: scope?.inchargeSectionIds ?? [] } } }),
    };
    const rows = await tx.leaveRequest.findMany({
      where,
      include,
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
    });
    const shaped = rows.map((r) => shape(r, clock.leaveAgeOutHours, clock.now));
    return ctx.user.role === 'TEACHER' ? shaped.filter((r) => !r.escalated) : shaped;
  });
}

export const decideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().trim().max(300).optional(),
});

export async function decideLeave(ctx: AuthedContext, id: string, input: z.infer<typeof decideSchema>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const r = await tx.leaveRequest.findUnique({ where: { id }, include });
    if (!r) throw notFound('Leave request');
    const shaped = shape(r, clock.leaveAgeOutHours, clock.now);
    if (!(await canDecide(ctx, tx, r, shaped.escalated))) {
      if (r.applicantId === ctx.user.id) throw forbidden('You can’t decide your own leave request');
      throw forbidden('You can’t decide this leave request');
    }
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', 'This request has already been decided');
    await tx.leaveRequest.update({
      where: { id },
      data: { status: input.decision, decidedBy: ctx.user.id, decidedAt: new Date(), decisionNote: input.note || null },
    });
    await audit(ctx, tx, {
      action: input.decision === 'APPROVED' ? 'leave.approve' : 'leave.reject',
      entity: 'LeaveRequest',
      entityId: id,
      before: { status: 'PENDING' },
      after: { status: input.decision, note: input.note ?? null, escalated: shaped.escalated },
    });
    await notify(tx, ctx.tenantId!, [r.applicantId], {
      kind: 'leave',
      title: `Leave ${input.decision === 'APPROVED' ? 'approved' : 'not approved'}`,
      body: `${r.type.name} ${shaped.fromDate} – ${shaped.toDate}${input.note ? `: ${input.note}` : ''}`,
      link: r.studentId ? '/student/leave' : '/staff/leave',
    });
    return { ok: true };
  });
}

export async function cancelLeave(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const r = await tx.leaveRequest.findUnique({ where: { id } });
    if (!r || r.applicantId !== ctx.user.id) throw notFound('Leave request');
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', 'Only pending requests can be cancelled');
    await tx.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await audit(ctx, tx, { action: 'leave.cancel', entity: 'LeaveRequest', entityId: id });
    return { ok: true };
  });
}

/** Count of pending requests the caller can act on (dashboard badge). */
export async function pendingApprovals(ctx: AuthedContext) {
  if (ctx.user.role === 'STUDENT') return 0;
  return (await approvalQueue(ctx, 'PENDING')).length;
}
