import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant, schoolClock, sectionLabel, teacherScope, weekday } from '@/server/school/common';

export const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Default school week (decision D12): Mon–Sat, 8 periods of 40 min from 08:00, 20-min break after period 4. */
export function defaultPeriods() {
  const out: { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean }[] = [];
  let t = 8 * 60;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  for (let p = 1; p <= 9; p++) {
    const isBreak = p === 5;
    const len = isBreak ? 20 : 40;
    out.push({ periodNo: p, startsAt: fmt(t), endsAt: fmt(t + len), isBreak });
    t += len;
  }
  return out;
}

async function ensureSlots(tx: TenantTx, tenantId: string) {
  if ((await tx.timetableSlot.count()) > 0) return;
  const data = [1, 2, 3, 4, 5, 6].flatMap((day) => defaultPeriods().map((p) => ({ ...p, dayOfWeek: day, tenantId })));
  await tx.timetableSlot.createMany({ data, skipDuplicates: true });
}

async function slotGrid(tx: TenantTx, tenantId: string) {
  await ensureSlots(tx, tenantId);
  const slots = await tx.timetableSlot.findMany({ orderBy: [{ dayOfWeek: 'asc' }, { periodNo: 'asc' }] });
  const days = [...new Set(slots.map((s) => s.dayOfWeek))];
  const periods = [
    ...new Map(
      slots.map((s) => [
        s.periodNo,
        { periodNo: s.periodNo, startsAt: s.startsAt, endsAt: s.endsAt, isBreak: s.isBreak },
      ]),
    ).values(),
  ].sort((a, b) => a.periodNo - b.periodNo);
  return { slots, days, periods };
}

export async function getPeriods(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const g = await slotGrid(tx, ctx.tenantId!);
    return { days: g.days, periods: g.periods };
  });
}

export const periodsSchema = z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  periods: z
    .array(
      z.object({
        startsAt: z.string().regex(/^\d{2}:\d{2}$/),
        endsAt: z.string().regex(/^\d{2}:\d{2}$/),
        isBreak: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(14)
    .refine((ps) => ps.every((p) => p.endsAt > p.startsAt), 'Each period must end after it starts')
    .refine((ps) => ps.every((p, i) => i === 0 || p.startsAt >= ps[i - 1]!.endsAt), 'Periods must not overlap'),
});

/** Rewrites the period grid; lessons already placed in a kept day/period stay. */
export async function savePeriods(ctx: AuthedContext, input: z.infer<typeof periodsSchema>) {
  return inTenant(
    ctx,
    async (tx) => {
      await ensureSlots(tx, ctx.tenantId!);
      const days = [...new Set(input.days)];
      await tx.timetableSlot.deleteMany({
        where: { OR: [{ dayOfWeek: { notIn: days } }, { periodNo: { gt: input.periods.length } }] },
      });
      for (const day of days) {
        for (const [i, p] of input.periods.entries()) {
          await tx.timetableSlot.upsert({
            where: { tenantId_dayOfWeek_periodNo: { tenantId: ctx.tenantId!, dayOfWeek: day, periodNo: i + 1 } },
            create: { tenantId: ctx.tenantId!, dayOfWeek: day, periodNo: i + 1, ...p },
            update: { ...p },
          });
        }
      }
      // Breaks can't hold lessons.
      await tx.timetableEntry.deleteMany({ where: { slot: { isBreak: true } } });
      await audit(ctx, tx, {
        action: 'timetable.periods',
        entity: 'TimetableSlot',
        metadata: { days, periods: input.periods },
      });
      return { ok: true };
    },
    30000,
  );
}

type Cell = {
  slotId: string;
  subject: string;
  subjectId: string;
  teacher: string | null;
  teacherId: string | null;
  room: string | null;
  section?: string;
};

function shapeGrid(
  g: Awaited<ReturnType<typeof slotGrid>>,
  entries: {
    slotId: string;
    subjectId: string;
    subject: { name: string };
    teacherId: string | null;
    teacher: { user: { displayName: string } } | null;
    room: string | null;
    section?: { name: string; class: { name: string } };
  }[],
) {
  const bySlot = new Map(entries.map((e) => [e.slotId, e]));
  return {
    days: g.days.map((d) => ({ day: d, name: DAY_NAMES[d]! })),
    periods: g.periods,
    cells: Object.fromEntries(
      g.slots.map((s) => {
        const e = bySlot.get(s.id);
        const cell: Cell | null = e
          ? {
              slotId: s.id,
              subject: e.subject.name,
              subjectId: e.subjectId,
              teacher: e.teacher?.user.displayName ?? null,
              teacherId: e.teacherId,
              room: e.room,
              section: e.section ? sectionLabel(e.section) : undefined,
            }
          : null;
        return [`${s.dayOfWeek}:${s.periodNo}`, { slotId: s.id, isBreak: s.isBreak, entry: cell }];
      }),
    ) as Record<string, { slotId: string; isBreak: boolean; entry: Cell | null }>,
  };
}

const entryInclude = {
  subject: { select: { name: true } },
  teacher: { include: { user: { select: { displayName: true } } } },
  section: { include: { class: true } },
} as const;

export async function sectionTimetable(ctx: AuthedContext, sectionId: string) {
  return inTenant(ctx, async (tx) => {
    const section = await tx.section.findUnique({
      where: { id: sectionId },
      include: { class: { include: { subjects: { include: { subject: true } } } } },
    });
    if (!section) throw notFound('Section');
    if (ctx.user.role === 'TEACHER') {
      const scope = await teacherScope(tx, ctx.user.id);
      if (!scope.sectionIds.includes(sectionId)) throw notFound('Section');
    }
    const g = await slotGrid(tx, ctx.tenantId!);
    // Viewing one section: each cell shows the teacher, not the (obvious) section.
    const entries = (await tx.timetableEntry.findMany({ where: { sectionId }, include: entryInclude })).map(
      ({ section: _s, ...e }) => e,
    );
    const assignments = await tx.teacherAssignment.findMany({
      where: { sectionId },
      include: { teacher: { include: { user: { select: { displayName: true } } } } },
    });
    return {
      section: { id: section.id, label: sectionLabel(section) },
      subjects: section.class.subjects.map((s) => ({
        id: s.subjectId,
        name: s.subject.name,
        teachers: assignments
          .filter((a) => a.subjectId === s.subjectId)
          .map((a) => ({ id: a.teacherId, name: a.teacher.user.displayName })),
      })),
      ...shapeGrid(g, entries),
    };
  });
}

export async function myTimetable(ctx: AuthedContext) {
  return inTenant(ctx, async (tx) => {
    const g = await slotGrid(tx, ctx.tenantId!);
    let entries;
    if (ctx.user.role === 'STUDENT') {
      const s = await tx.student.findUnique({ where: { userId: ctx.user.id } });
      entries = s?.sectionId
        ? await tx.timetableEntry.findMany({ where: { sectionId: s.sectionId }, include: entryInclude })
        : [];
    } else {
      const t = await tx.teacher.findUnique({ where: { userId: ctx.user.id } });
      entries = t
        ? await tx.timetableEntry.findMany({
            where: { teacherId: t.id, section: { class: { academicYear: { status: 'CURRENT' } } } },
            include: entryInclude,
          })
        : [];
    }
    return shapeGrid(g, entries);
  });
}

/** Today's lessons for the signed-in teacher or student (dashboards). */
export async function todayLessons(ctx: AuthedContext) {
  const [grid, clock] = await Promise.all([myTimetable(ctx), inTenant(ctx, (tx) => schoolClock(tx))]);
  const day = weekday(clock.today);
  return {
    dayName: DAY_NAMES[day]!,
    schoolDay: grid.days.some((d) => d.day === day),
    now: clock.time,
    lessons: grid.periods
      .map((p) => ({ ...p, cell: grid.cells[`${day}:${p.periodNo}`] }))
      .filter((p) => p.cell && (p.cell.entry || p.isBreak))
      .map((p) => ({
        periodNo: p.periodNo,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        isBreak: p.isBreak,
        entry: p.cell!.entry,
      })),
  };
}

export const setEntrySchema = z.object({
  sectionId: z.string().uuid(),
  slotId: z.string().uuid(),
  subjectId: z.string().uuid().nullable(),
  teacherId: z.string().uuid().nullable().optional(),
  room: z.string().trim().max(20).nullable().optional(),
});

/** Place or clear a lesson. Clashes are rejected by the database and explained (spec §8.6). */
export async function setEntry(ctx: AuthedContext, input: z.infer<typeof setEntrySchema>) {
  try {
    return await inTenant(ctx, async (tx) => {
      const slot = await tx.timetableSlot.findUnique({ where: { id: input.slotId } });
      if (!slot) throw notFound('Period');
      if (slot.isBreak) throw new AppError('VALIDATION_FAILED', 'That period is a break');
      const section = await tx.section.findUnique({
        where: { id: input.sectionId },
        include: { class: { include: { subjects: true } } },
      });
      if (!section) throw notFound('Section');
      if (input.subjectId && !section.class.subjects.some((s) => s.subjectId === input.subjectId)) {
        throw new AppError('VALIDATION_FAILED', 'That subject isn’t taught in this class');
      }
      if (input.teacherId && !(await tx.teacher.findUnique({ where: { id: input.teacherId } })))
        throw notFound('Teacher');
      const key = { sectionId_slotId: { sectionId: input.sectionId, slotId: input.slotId } };
      if (!input.subjectId) {
        await tx.timetableEntry.deleteMany({ where: { sectionId: input.sectionId, slotId: input.slotId } });
        await audit(ctx, tx, { action: 'timetable.clear', entity: 'TimetableEntry', metadata: input });
        return { ok: true };
      }
      if (input.teacherId) {
        const clash = await tx.timetableEntry.findFirst({
          where: { teacherId: input.teacherId, slotId: input.slotId, NOT: { sectionId: input.sectionId } },
          include: { section: { include: { class: true } }, teacher: { include: { user: true } } },
        });
        if (clash) {
          throw new AppError(
            'CONFLICT',
            `${clash.teacher?.user.displayName} already teaches ${sectionLabel(clash.section)} in this period (${DAY_NAMES[slot.dayOfWeek]} P${slot.periodNo})`,
          );
        }
      }
      const data = { subjectId: input.subjectId, teacherId: input.teacherId ?? null, room: input.room || null };
      await tx.timetableEntry.upsert({
        where: key,
        create: { tenantId: ctx.tenantId!, sectionId: input.sectionId, slotId: input.slotId, ...data },
        update: data,
      });
      await audit(ctx, tx, { action: 'timetable.set', entity: 'TimetableEntry', metadata: input });
      return { ok: true };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw new AppError('CONFLICT', 'That teacher is already teaching another section in this period');
    if ((e as Error).message?.includes('cross-tenant reference rejected')) throw notFound();
    throw e;
  }
}
