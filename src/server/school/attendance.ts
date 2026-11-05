import 'server-only';
import type { AttendanceStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, forbidden, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import {
  ATTENDANCE_CORRECTION_DAYS,
  addDays,
  attendancePct,
  audit,
  countedPeriods,
  countedPeriodsSql,
  dateInTz,
  inTenant,
  isoDate,
  schoolClock,
  sectionLabel,
  teacherScope,
  timeInTz,
  toDate,
  weekday,
} from '@/server/school/common';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-09-03');
export const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'EXCUSED'] as const;

type Counts = Record<AttendanceStatus, number>;
const zero = (): Counts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0 });

/**
 * Who may take/edit a section's register (spec §2.4, §2.5, §6.4):
 *  - attendance.oversee (School Admin; Principal if enabled): any date, any time.
 *  - the section's Class Incharge or a teacher assigned to it: within the 3-day rolling window.
 */
async function access(ctx: AuthedContext, tx: TenantTx, sectionId: string) {
  if (ctx.can('attendance.oversee')) return { overseer: true, inScope: true, isIncharge: false };
  if (!ctx.can('attendance.submit')) return { overseer: false, inScope: false, isIncharge: false };
  const scope = await teacherScope(tx, ctx.user.id);
  return {
    overseer: false,
    inScope: scope.sectionIds.includes(sectionId),
    isIncharge: scope.inchargeSectionIds.includes(sectionId),
  };
}

function windowFor(date: string, today: string) {
  const lastEditable = addDays(date, ATTENDANCE_CORRECTION_DAYS);
  return { lastEditable, open: date <= today && today <= lastEditable };
}

async function approvedLeaveFor(tx: TenantTx, studentIds: string[], date: string) {
  const d = toDate(date);
  const rows = await tx.leaveRequest.findMany({
    where: { studentId: { in: studentIds }, status: 'APPROVED', fromDate: { lte: d }, toDate: { gte: d } },
    select: { studentId: true },
  });
  return new Set(rows.map((r) => r.studentId!));
}

/**
 * Registers a section can have on a day (spec §6.6). Once-daily schools: one register ("period 1"). Per-period
 * schools: one per timetabled teaching period that day, labelled with its time and subject.
 */
async function periodOptions(tx: TenantTx, sectionId: string, day: string, mode: string) {
  if (mode !== 'PER_PERIOD') return [{ period: 1, label: 'Whole day', subjectId: null as string | null }];
  const dow = weekday(day);
  const slots = await tx.timetableSlot.findMany({
    where: { dayOfWeek: dow, isBreak: false },
    orderBy: { periodNo: 'asc' },
  });
  if (!slots.length) return [{ period: 1, label: 'Period 1', subjectId: null }];
  const entries = await tx.timetableEntry.findMany({
    where: { sectionId, slotId: { in: slots.map((x) => x.id) } },
    include: { subject: { select: { name: true } } },
  });
  const bySlot = new Map(entries.map((e) => [e.slotId, e]));
  return slots.map((x, i) => {
    const e = bySlot.get(x.id);
    return {
      period: x.periodNo,
      label: `P${i + 1} · ${x.startsAt}${e ? ` · ${e.subject.name}` : ''}`,
      subjectId: e?.subjectId ?? null,
    };
  });
}

function resolvePeriod(options: { period: number }[], requested?: number) {
  if (requested === undefined) return options[0]!.period;
  if (!options.some((o) => o.period === requested))
    throw new AppError('VALIDATION_FAILED', 'That period isn’t on today’s timetable');
  return requested;
}

/** The register for one section and date, with what the caller may do with it. */
export async function attendanceSheet(ctx: AuthedContext, sectionId: string, date?: string, period?: number) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const day = date ?? clock.today;
    const periods = await periodOptions(tx, sectionId, day, clock.attendanceMode);
    const p = resolvePeriod(periods, period);
    const acc = await access(ctx, tx, sectionId);
    if (!acc.inScope) throw notFound('Section');
    const section = await tx.section.findUnique({ where: { id: sectionId }, include: { class: true } });
    if (!section) throw notFound('Section');
    const students = await tx.student.findMany({
      where: { sectionId, status: 'ACTIVE' },
      include: { user: { select: { displayName: true } } },
      orderBy: { rollNumber: 'asc' },
    });
    const batch = await tx.attendanceBatch.findUnique({
      where: { tenantId_sectionId_date_period: { tenantId: ctx.tenantId!, sectionId, date: toDate(day), period: p } },
      include: { records: true },
    });
    const submitter = batch
      ? await tx.user.findUnique({ where: { id: batch.submittedBy }, select: { displayName: true } })
      : null;
    const onLeave = await approvedLeaveFor(
      tx,
      students.map((s) => s.id),
      day,
    );
    const byStudent = new Map(batch?.records.map((r) => [r.studentId, r.status]) ?? []);
    const win = windowFor(day, clock.today);
    const future = day > clock.today;
    const canEdit = !future && (acc.overseer || win.open);
    return {
      section: { id: section.id, label: sectionLabel(section) },
      date: day,
      today: clock.today,
      timezone: clock.timezone,
      submitted: batch
        ? {
            at: batch.serverReceivedAt,
            by: submitter?.displayName ?? 'Unknown',
            syncedLate: batch.syncedLate,
            clientRecordedAt: batch.clientRecordedAt,
            updatedAt: batch.updatedAt,
          }
        : null,
      canEdit,
      lockedReason: future
        ? 'You can’t take attendance for a future date.'
        : canEdit
          ? null
          : `The ${ATTENDANCE_CORRECTION_DAYS}-day correction window closed on ${win.lastEditable}. Ask the School Admin to make changes.`,
      editableUntil: acc.overseer ? null : win.lastEditable,
      mode: clock.attendanceMode,
      period: p,
      periods,
      students: students.map((s) => ({
        id: s.id,
        name: s.user.displayName,
        rollNumber: s.rollNumber,
        status: byStudent.get(s.id) ?? null,
        onApprovedLeave: onLeave.has(s.id),
      })),
    };
  });
}

export const submitSchema = z.object({
  sectionId: z.string().uuid(),
  date: dateStr,
  /** Client-generated idempotency key: a resent offline batch never creates a duplicate (spec §6.2). */
  clientUuid: z.string().uuid(),
  clientRecordedAt: z.string().datetime().optional(),
  /** Per-period schools: which period (spec §6.6). Once-daily schools always use 1. */
  period: z.number().int().min(1).max(14).optional(),
  records: z
    .array(z.object({ studentId: z.string().uuid(), status: z.enum(STATUSES) }))
    .min(1)
    .max(200),
});

/**
 * Batch submit (spec §6.3): one transaction, one audit entry. Every record is re-validated on the server.
 * Re-submitting an existing register is a correction (last write wins, before/after audited).
 */
export async function submitAttendance(ctx: AuthedContext, input: z.infer<typeof submitSchema>) {
  return inTenant(ctx, async (tx) => {
    const dupe = await tx.attendanceBatch.findUnique({
      where: { tenantId_clientUuid: { tenantId: ctx.tenantId!, clientUuid: input.clientUuid } },
    });
    if (dupe) return { batchId: dupe.id, duplicate: true, corrected: false, syncedLate: dupe.syncedLate };

    const clock = await schoolClock(tx);
    const acc = await access(ctx, tx, input.sectionId);
    if (!acc.inScope) throw forbidden('You are not assigned to this section');
    if (input.date > clock.today)
      throw new AppError('VALIDATION_FAILED', 'You can’t take attendance for a future date');
    const win = windowFor(input.date, clock.today);
    if (!acc.overseer && !win.open) {
      throw new AppError(
        'FORBIDDEN',
        `The ${ATTENDANCE_CORRECTION_DAYS}-day correction window for ${input.date} has closed. Ask the School Admin.`,
      );
    }

    const ids = [...new Set(input.records.map((r) => r.studentId))];
    if (ids.length !== input.records.length) throw new AppError('VALIDATION_FAILED', 'A student appears twice');
    const valid = await tx.student.count({ where: { id: { in: ids }, sectionId: input.sectionId, status: 'ACTIVE' } });
    if (valid !== ids.length) throw new AppError('VALIDATION_FAILED', 'Some students are not in this section');

    const options = await periodOptions(tx, input.sectionId, input.date, clock.attendanceMode);
    const period = resolvePeriod(options, input.period);
    const subjectId = options.find((o) => o.period === period)?.subjectId ?? null;
    const clientAt = input.clientRecordedAt ? new Date(input.clientRecordedAt) : null;
    const syncedLate = !!clientAt && clock.now.getTime() - clientAt.getTime() > 60 * 60 * 1000;
    const key = {
      tenantId_sectionId_date_period: {
        tenantId: ctx.tenantId!,
        sectionId: input.sectionId,
        date: toDate(input.date),
        period,
      },
    };
    const existing = await tx.attendanceBatch.findUnique({ where: key, include: { records: true } });

    if (!existing) {
      const batch = await tx.attendanceBatch.create({
        data: {
          tenantId: ctx.tenantId!,
          sectionId: input.sectionId,
          date: toDate(input.date),
          period,
          subjectId,
          submittedBy: ctx.user.id,
          clientUuid: input.clientUuid,
          clientRecordedAt: clientAt,
          syncedLate,
          records: {
            create: input.records.map((r) => ({ tenantId: ctx.tenantId!, studentId: r.studentId, status: r.status })),
          },
        },
      });
      const counts = zero();
      for (const r of input.records) counts[r.status]++;
      await audit(ctx, tx, {
        action: 'attendance.submit',
        entity: 'AttendanceBatch',
        entityId: batch.id,
        metadata: { date: input.date, sectionId: input.sectionId, counts, syncedLate },
      });
      return { batchId: batch.id, duplicate: false, corrected: false, syncedLate };
    }

    // Correction: last write wins; both attempts audited (spec §6.2).
    const before = new Map(existing.records.map((r) => [r.studentId, r.status]));
    const changes = input.records.filter((r) => before.get(r.studentId) !== r.status);
    for (const r of changes) {
      await tx.attendanceRecord.upsert({
        where: { batchId_studentId: { batchId: existing.id, studentId: r.studentId } },
        create: { tenantId: ctx.tenantId!, batchId: existing.id, studentId: r.studentId, status: r.status },
        update: { status: r.status },
      });
    }
    await tx.attendanceBatch.update({
      where: { id: existing.id },
      data: { updatedBy: ctx.user.id, clientUuid: input.clientUuid, syncedLate: existing.syncedLate || syncedLate },
    });
    await audit(ctx, tx, {
      action: 'attendance.correct',
      entity: 'AttendanceBatch',
      entityId: existing.id,
      metadata: {
        date: input.date,
        sectionId: input.sectionId,
        outsideWindow: !win.open,
        changes: changes.map((c) => ({ student: c.studentId, from: before.get(c.studentId) ?? null, to: c.status })),
      },
    });
    return { batchId: existing.id, duplicate: false, corrected: true, changed: changes.length, syncedLate };
  });
}

/** Monthly grid for a section (spec §2.5 Class Incharge; §2.1 School Admin). */
export async function sectionGrid(ctx: AuthedContext, sectionId: string, month?: string, period = 1) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const acc = await access(ctx, tx, sectionId);
    if (!acc.inScope) throw notFound('Section');
    const section = await tx.section.findUnique({ where: { id: sectionId }, include: { class: true } });
    if (!section) throw notFound('Section');
    const m = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : clock.today.slice(0, 7);
    const start = `${m}-01`;
    const next = new Date(`${start}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const end = addDays(next.toISOString().slice(0, 10), -1);
    const [students, batches] = await Promise.all([
      tx.student.findMany({
        where: { sectionId, status: 'ACTIVE' },
        include: { user: { select: { displayName: true } } },
        orderBy: { rollNumber: 'asc' },
      }),
      tx.attendanceBatch.findMany({
        where: { sectionId, period, date: { gte: toDate(start), lte: toDate(end) } },
        include: { records: { select: { studentId: true, status: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);
    const days = batches.map((b) => isoDate(b.date)!);
    const cell = new Map<string, AttendanceStatus>();
    for (const b of batches) for (const r of b.records) cell.set(`${r.studentId}:${isoDate(b.date)}`, r.status);
    return {
      section: { id: section.id, label: sectionLabel(section) },
      month: m,
      today: clock.today,
      days,
      canEditAll: acc.overseer,
      editableFrom: acc.overseer ? null : addDays(clock.today, -ATTENDANCE_CORRECTION_DAYS),
      rows: students.map((s) => {
        const counts = zero();
        const statuses = days.map((d) => {
          const st = cell.get(`${s.id}:${d}`) ?? null;
          if (st) counts[st]++;
          return st;
        });
        return { id: s.id, name: s.user.displayName, rollNumber: s.rollNumber, statuses, pct: attendancePct(counts) };
      }),
    };
  });
}

export const setOneSchema = z.object({
  period: z.number().int().min(1).max(14).optional(),
  sectionId: z.string().uuid(),
  date: dateStr,
  studentId: z.string().uuid(),
  status: z.enum(STATUSES),
});

/** Single-cell correction from the grid (same rules as a batch). */
export async function setOne(ctx: AuthedContext, input: z.infer<typeof setOneSchema>) {
  const sheet = await attendanceSheet(ctx, input.sectionId, input.date, input.period);
  if (!sheet.canEdit) throw new AppError('FORBIDDEN', sheet.lockedReason ?? 'You can’t edit this day');
  const records = sheet.students.map((s) => ({
    studentId: s.id,
    status: (s.id === input.studentId ? input.status : (s.status ?? 'PRESENT')) as (typeof STATUSES)[number],
  }));
  if (!records.some((r) => r.studentId === input.studentId)) throw notFound('Student');
  return submitAttendance(ctx, {
    sectionId: input.sectionId,
    date: input.date,
    period: sheet.period,
    clientUuid: crypto.randomUUID(),
    records,
  });
}

// ── Summaries (computed at read time, spec §6.1) ────────────────────────────

export async function countsByStudent(tx: TenantTx, where: Prisma.AttendanceRecordWhereInput) {
  const groups = await tx.attendanceRecord.groupBy({ by: ['studentId', 'status'], where, _count: { _all: true } });
  const map = new Map<string, Counts>();
  for (const g of groups) {
    const c = map.get(g.studentId) ?? zero();
    c[g.status] = g._count._all;
    map.set(g.studentId, c);
  }
  return map;
}

export async function studentAttendance(ctx: AuthedContext, studentId: string) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    const from = year ? year.startsOn : toDate(addDays(clock.today, -365));
    const records = await tx.attendanceRecord.findMany({
      where: { studentId, batch: { date: { gte: from }, ...countedPeriods(clock.attendanceMode) } },
      select: { status: true, batch: { select: { date: true } } },
      orderBy: { batch: { date: 'asc' } },
    });
    const counts = zero();
    for (const r of records) counts[r.status]++;
    const byDay = Object.fromEntries(records.map((r) => [isoDate(r.batch.date)!, r.status]));
    return { counts, pct: attendancePct(counts), byDay, today: clock.today, threshold: clock.atRiskThreshold };
  });
}

/** School-wide attendance overview for dashboards. */
export async function attendanceOverview(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const year = await tx.academicYear.findFirst({ where: { status: 'CURRENT' } });
    if (!year) return null;
    const sections = await tx.section.findMany({
      where: { class: { academicYearId: year.id } },
      include: {
        class: true,
        classTeacher: { include: { user: { select: { displayName: true } } } },
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
      },
    });
    const todayBatches = await tx.attendanceBatch.findMany({
      where: {
        date: toDate(clock.today),
        ...countedPeriods(clock.attendanceMode),
        sectionId: { in: sections.map((s) => s.id) },
      },
      include: { records: { select: { status: true } } },
    });
    const submitted = new Set(todayBatches.map((b) => b.sectionId));
    const todayCounts = zero();
    for (const b of todayBatches) for (const r of b.records) todayCounts[r.status]++;

    // Daily % for the last 30 school days.
    const since = addDays(clock.today, -42);
    const daily = await tx.$queryRaw<{ day: Date; attended: bigint; considered: bigint }[]>`
      SELECT b.date AS day,
             COUNT(*) FILTER (WHERE r.status IN ('PRESENT','LATE')) AS attended,
             COUNT(*) FILTER (WHERE r.status IN ('PRESENT','LATE','ABSENT')) AS considered
      FROM attendance_batches b JOIN attendance_records r ON r.batch_id = b.id
      WHERE b.date >= ${toDate(since)} AND b.date <= ${toDate(clock.today)} ${countedPeriodsSql(clock.attendanceMode)}
      GROUP BY b.date ORDER BY b.date`;
    const trend = daily
      .map((d) => ({
        day: isoDate(d.day)!,
        pct: Number(d.considered) ? Math.round((Number(d.attended) / Number(d.considered)) * 1000) / 10 : null,
      }))
      .filter((d) => d.pct !== null)
      .slice(-30) as { day: string; pct: number }[];

    // At-risk: below the school threshold this year, with at least 10 recorded days.
    const counts = await countsByStudent(tx, {
      batch: { date: { gte: year.startsOn }, ...countedPeriods(clock.attendanceMode) },
      student: { status: 'ACTIVE' },
    });
    const risky = [...counts.entries()]
      .map(([id, c]) => ({ id, pct: attendancePct(c), days: c.PRESENT + c.LATE + c.ABSENT }))
      .filter((r) => r.pct !== null && r.days >= 10 && r.pct < clock.atRiskThreshold)
      .sort((a, b) => a.pct! - b.pct!);
    const riskyStudents = await tx.student.findMany({
      where: { id: { in: risky.slice(0, 50).map((r) => r.id) } },
      include: { user: { select: { displayName: true } }, section: { include: { class: true } } },
    });
    const info = new Map(riskyStudents.map((s) => [s.id, s]));

    return {
      today: clock.today,
      threshold: clock.atRiskThreshold,
      sectionsTotal: sections.length,
      sectionsSubmitted: submitted.size,
      todayPct: attendancePct(todayCounts),
      todayCounts,
      pending: sections
        .filter((s) => !submitted.has(s.id) && s._count.students > 0)
        .sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.name.localeCompare(b.name))
        .map((s) => ({ id: s.id, label: sectionLabel(s), incharge: s.classTeacher?.user.displayName ?? null })),
      trend,
      atRiskCount: risky.length,
      atRisk: risky.slice(0, 50).map((r) => {
        const s = info.get(r.id);
        return {
          id: r.id,
          name: s?.user.displayName ?? '—',
          section: s?.section ? sectionLabel(s.section) : '—',
          pct: r.pct!,
          days: r.days,
        };
      }),
    };
  });
}

/** Sections the teacher should mark today (incharge sections in once-daily mode), with status. */
export async function teacherAttendanceTodo(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const scope = await teacherScope(tx, ctx.user.id);
    const ids = scope.inchargeSectionIds.length ? scope.inchargeSectionIds : scope.sectionIds;
    const sections = await tx.section.findMany({
      where: { id: { in: ids }, class: { academicYear: { status: 'CURRENT' } } },
      include: { class: true },
    });
    const done = await tx.attendanceBatch.findMany({
      where: { sectionId: { in: ids }, date: toDate(clock.today), period: 1 },
      select: { sectionId: true },
    });
    const doneSet = new Set(done.map((d) => d.sectionId));
    return sections.map((s) => ({ id: s.id, label: sectionLabel(s), done: doneSet.has(s.id) }));
  });
}

// ── Teacher self check-in (spec §6.5) ───────────────────────────────────────

export const checkInSchema = z.object({ clientRecordedAt: z.string().datetime().optional() }).default({});

export async function myCheckIn(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const teacher = await tx.teacher.findUnique({ where: { userId: ctx.user.id } });
    if (!teacher) return null;
    const row = await tx.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: teacher.id, date: toDate(clock.today) } },
    });
    return { today: clock.today, status: row?.status ?? null, checkedInAt: row?.checkedInAt ?? null };
  });
}

export async function checkIn(ctx: AuthedContext, input: z.infer<typeof checkInSchema>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const teacher = await tx.teacher.findUnique({ where: { userId: ctx.user.id } });
    if (!teacher) throw forbidden('Only teachers can check in');
    // Offline check-ins keep the time the teacher actually tapped, if it was today in school time.
    const tapped = input.clientRecordedAt ? new Date(input.clientRecordedAt) : clock.now;
    const at = dateInTz(tapped, clock.timezone) === clock.today && tapped <= clock.now ? tapped : clock.now;
    const firstPeriod = await tx.timetableSlot.findFirst({ where: { periodNo: 1 }, orderBy: { dayOfWeek: 'asc' } });
    const start = firstPeriod?.startsAt ?? '08:00';
    // Late = more than 15 minutes after the first period starts (school time).
    const [h, m] = start.split(':').map(Number) as [number, number];
    const cutoff = h * 60 + m + 15;
    const [ah, am] = timeInTz(at, clock.timezone).split(':').map(Number) as [number, number];
    const status = ah * 60 + am > cutoff ? 'LATE' : 'PRESENT';
    const existing = await tx.teacherAttendance.findUnique({
      where: { teacherId_date: { teacherId: teacher.id, date: toDate(clock.today) } },
    });
    if (existing) return { status: existing.status, checkedInAt: existing.checkedInAt, alreadyCheckedIn: true };
    const row = await tx.teacherAttendance.create({
      data: { tenantId: ctx.tenantId!, teacherId: teacher.id, date: toDate(clock.today), status, checkedInAt: at },
    });
    await audit(ctx, tx, {
      action: 'teacher_attendance.check_in',
      entity: 'TeacherAttendance',
      entityId: row.id,
      metadata: { status },
    });
    return { status: row.status, checkedInAt: row.checkedInAt, alreadyCheckedIn: false };
  });
}

export async function teacherBoard(ctx: AuthedContext, date?: string) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : clock.today;
    const [teachers, rows] = await Promise.all([
      tx.teacher.findMany({
        where: { user: { status: 'ACTIVE' } },
        include: { user: { select: { displayName: true } } },
      }),
      tx.teacherAttendance.findMany({ where: { date: toDate(day) } }),
    ]);
    const byTeacher = new Map(rows.map((r) => [r.teacherId, r]));
    const list = teachers
      .map((t) => {
        const r = byTeacher.get(t.id);
        return {
          teacherId: t.id,
          name: t.user.displayName,
          status: r?.status ?? null,
          checkedInAt: r?.checkedInAt ?? null,
          corrected: !!r?.correctedBy,
          note: r?.note ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const count = (s: string | null) => list.filter((x) => x.status === s).length;
    return {
      date: day,
      today: clock.today,
      timezone: clock.timezone,
      list,
      summary: {
        present: count('PRESENT'),
        late: count('LATE'),
        absent: count('ABSENT'),
        leave: count('LEAVE'),
        missing: count(null),
        total: list.length,
      },
    };
  });
}

export const setTeacherAttendanceSchema = z.object({
  teacherId: z.string().uuid(),
  date: dateStr,
  status: z.enum(['PRESENT', 'LATE', 'ABSENT', 'LEAVE']),
  note: z.string().trim().max(200).optional(),
});

/** School Admin / Principal can correct any day (spec §6.5: no separate window for teacher attendance). */
export async function setTeacherAttendance(ctx: AuthedContext, input: z.infer<typeof setTeacherAttendanceSchema>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    if (input.date > clock.today) throw new AppError('VALIDATION_FAILED', 'You can’t set attendance for a future date');
    if (!(await tx.teacher.findUnique({ where: { id: input.teacherId } }))) throw notFound('Teacher');
    const key = { teacherId_date: { teacherId: input.teacherId, date: toDate(input.date) } };
    const before = await tx.teacherAttendance.findUnique({ where: key });
    const row = await tx.teacherAttendance.upsert({
      where: key,
      create: {
        tenantId: ctx.tenantId!,
        teacherId: input.teacherId,
        date: toDate(input.date),
        status: input.status,
        note: input.note ?? null,
        correctedBy: ctx.user.id,
      },
      update: { status: input.status, note: input.note ?? null, correctedBy: ctx.user.id },
    });
    await audit(ctx, tx, {
      action: 'teacher_attendance.correct',
      entity: 'TeacherAttendance',
      entityId: row.id,
      before: { status: before?.status ?? null },
      after: { status: input.status, date: input.date },
    });
    return { ok: true };
  });
}

/** Sections the caller can take attendance for, with today's status (overseers: all current sections). */
export async function attendanceSections(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const overseer = ctx.can('attendance.oversee');
    const scope = overseer ? null : await teacherScope(tx, ctx.user.id);
    const sections = await tx.section.findMany({
      where: { class: { academicYear: { status: 'CURRENT' } }, ...(scope ? { id: { in: scope.sectionIds } } : {}) },
      include: { class: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
    });
    const batches = await tx.attendanceBatch.findMany({
      where: { sectionId: { in: sections.map((s) => s.id) }, date: toDate(clock.today), period: 1 },
      include: { records: { select: { status: true } } },
    });
    const byId = new Map(batches.map((b) => [b.sectionId, b]));
    return {
      today: clock.today,
      sections: sections
        .sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.name.localeCompare(b.name))
        .map((s) => {
          const b = byId.get(s.id);
          const absent = b?.records.filter((r) => r.status === 'ABSENT').length ?? 0;
          return {
            id: s.id,
            label: sectionLabel(s),
            students: s._count.students,
            isIncharge: scope?.inchargeSectionIds.includes(s.id) ?? false,
            done: !!b,
            absent,
            present: b ? b.records.length - absent : 0,
          };
        }),
    };
  });
}
