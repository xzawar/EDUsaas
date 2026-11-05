import 'server-only';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { normalizeUsername, studentUsername } from '@/server/auth/username';
import { revokeUserSessions } from '@/server/auth/session';
import { audit, inTenant, sectionLabel } from '@/server/school/common';

/**
 * Promotion (spec §5.4). Each move is either PROMOTE/REPEAT into a section of the target year, or GRADUATE.
 * Roll numbers carry over unchanged; if two incoming students share a roll number in the target section, the later
 * one gets the next free roll and the clash is reported. Usernames regenerate (class/section segment, and roll if it
 * had to change). Report-card archival and raw-data deletion are separate steps (decisions D9/D14).
 */
export const promotionSchema = z.object({
  fromYearId: z.string().uuid(),
  toYearId: z.string().uuid(),
  moves: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        action: z.enum(['PROMOTE', 'REPEAT', 'GRADUATE']),
        toSectionId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(3000),
});
export type PromotionInput = z.infer<typeof promotionSchema>;

type Plan = Awaited<ReturnType<typeof buildPlan>>;

async function buildPlan(tx: TenantTx, input: PromotionInput) {
  if (input.fromYearId === input.toYearId) throw new AppError('VALIDATION_FAILED', 'Choose a different target year');
  const [from, to] = await Promise.all([
    tx.academicYear.findUnique({ where: { id: input.fromYearId } }),
    tx.academicYear.findUnique({ where: { id: input.toYearId } }),
  ]);
  if (!from || !to) throw notFound('Academic year');
  if (to.status === 'CLOSED') throw new AppError('VALIDATION_FAILED', 'The target year is closed');

  const students = await tx.student.findMany({
    where: { id: { in: input.moves.map((m) => m.studentId) } },
    include: {
      user: { select: { id: true, displayName: true, username: true } },
      section: { include: { class: true } },
    },
  });
  const byId = new Map(students.map((s) => [s.id, s]));
  const targetIds = [...new Set(input.moves.map((m) => m.toSectionId).filter((x): x is string => !!x))];
  const targets = await tx.section.findMany({
    where: { id: { in: targetIds } },
    include: {
      class: true,
      // Every student holding a roll here (incl. withdrawn) counts, or a carried-over roll could collide.
      students: { select: { id: true, rollNumber: true } },
    },
  });
  const targetById = new Map(targets.map((t) => [t.id, t]));
  const prefix = (await tx.tenant.findFirstOrThrow({ select: { prefix: true } })).prefix;

  const taken = new Map<string, Set<number>>(
    targets.map((t) => [t.id, new Set(t.students.map((s) => s.rollNumber!).filter(Boolean))]),
  );
  const next = new Map<string, number>(targets.map((t) => [t.id, t.nextRollNumber]));
  const rows: {
    studentId: string;
    userId: string;
    name: string;
    from: string;
    action: 'PROMOTE' | 'REPEAT' | 'GRADUATE';
    toSectionId: string | null;
    to: string | null;
    oldRoll: number | null;
    newRoll: number | null;
    oldUsername: string | null;
    newUsername: string | null;
    rollChanged: boolean;
  }[] = [];
  const errors: string[] = [];

  for (const m of input.moves) {
    const s = byId.get(m.studentId);
    if (!s) {
      errors.push(`Student ${m.studentId} not found`);
      continue;
    }
    if (s.status !== 'ACTIVE') {
      errors.push(`${s.user.displayName} is not active`);
      continue;
    }
    if (s.section?.class.academicYearId !== input.fromYearId) {
      errors.push(`${s.user.displayName} is not in the source year`);
      continue;
    }
    const base = {
      studentId: s.id,
      userId: s.user.id,
      name: s.user.displayName,
      from: s.section ? sectionLabel(s.section) : '—',
      action: m.action,
      oldRoll: s.rollNumber,
      oldUsername: s.user.username,
    };
    if (m.action === 'GRADUATE') {
      rows.push({
        ...base,
        toSectionId: null,
        to: null,
        newRoll: null,
        newUsername: s.user.username,
        rollChanged: false,
      });
      continue;
    }
    const target = m.toSectionId ? targetById.get(m.toSectionId) : undefined;
    if (!target || target.class.academicYearId !== input.toYearId) {
      errors.push(`${s.user.displayName}: choose a section in the target year`);
      continue;
    }
    const used = taken.get(target.id)!;
    let roll = s.rollNumber ?? 0;
    let rollChanged = false;
    if (!roll || used.has(roll)) {
      let n = next.get(target.id)!;
      while (used.has(n)) n++;
      roll = n;
      next.set(target.id, n + 1);
      rollChanged = true;
    }
    used.add(roll);
    if (roll >= next.get(target.id)!) next.set(target.id, roll + 1);
    rows.push({
      ...base,
      toSectionId: target.id,
      to: sectionLabel(target),
      newRoll: roll,
      newUsername: studentUsername({
        prefix,
        className: target.class.name,
        sectionName: target.name,
        displayName: s.user.displayName,
        rollNumber: roll,
      }),
      rollChanged,
    });
  }
  return { from, to, rows, errors, nextRolls: next };
}

function summarize(plan: Plan) {
  const count = (a: string) => plan.rows.filter((r) => r.action === a).length;
  return {
    fromYear: plan.from.name,
    toYear: plan.to.name,
    promote: count('PROMOTE'),
    repeat: count('REPEAT'),
    graduate: count('GRADUATE'),
    rollClashes: plan.rows.filter((r) => r.rollChanged).length,
    errors: plan.errors,
  };
}

export async function previewPromotion(ctx: AuthedContext, input: PromotionInput) {
  return inTenant(
    ctx,
    async (tx) => {
      const plan = await buildPlan(tx, input);
      return { summary: summarize(plan), rows: plan.rows.map(({ userId: _u, ...r }) => r) };
    },
    30000,
  );
}

export async function runPromotion(ctx: AuthedContext, input: PromotionInput) {
  const result = await inTenant(
    ctx,
    async (tx) => {
      const plan = await buildPlan(tx, input);
      if (plan.errors.length) throw new AppError('VALIDATION_FAILED', plan.errors[0]!, plan.errors);
      const summary = summarize(plan);
      const job = await tx.job.create({
        data: {
          tenantId: ctx.tenantId!,
          type: 'promotion',
          status: 'RUNNING',
          payload: input,
          createdBy: ctx.user.id,
          startedAt: new Date(),
        },
      });
      // Free the target roll numbers first: move incoming students to a temporary high roll, then settle.
      const moving = plan.rows.filter((r) => r.toSectionId);
      for (const [i, r] of moving.entries()) {
        await tx.student.update({
          where: { id: r.studentId },
          data: { sectionId: r.toSectionId, rollNumber: 900000 + i },
        });
      }
      for (const r of moving) {
        await tx.student.update({ where: { id: r.studentId }, data: { rollNumber: r.newRoll } });
        if (r.newUsername && r.newUsername !== r.oldUsername) {
          await tx.user.update({
            where: { id: r.userId },
            data: { username: r.newUsername, usernameNormalized: normalizeUsername(r.newUsername) },
          });
        }
      }
      const graduates = plan.rows.filter((r) => r.action === 'GRADUATE');
      if (graduates.length) {
        await tx.student.updateMany({
          where: { id: { in: graduates.map((g) => g.studentId) } },
          data: { status: 'GRADUATED' },
        });
        await tx.user.updateMany({
          where: { id: { in: graduates.map((g) => g.userId) } },
          data: { status: 'DISABLED' },
        });
      }
      for (const [sectionId, nextRoll] of plan.nextRolls) {
        await tx.section.update({ where: { id: sectionId }, data: { nextRollNumber: nextRoll } });
      }
      const finished = await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'SUCCEEDED',
          finishedAt: new Date(),
          progress: { done: plan.rows.length, total: plan.rows.length },
          result: { ...summary, archive: 'skipped: report-card storage not configured (D14); raw data retained' },
        },
      });
      await audit(ctx, tx, {
        action: 'promotion.run',
        entity: 'Job',
        entityId: job.id,
        metadata: {
          ...summary,
          mapping: plan.rows.map((r) => ({
            student: r.studentId,
            action: r.action,
            to: r.to,
            roll: [r.oldRoll, r.newRoll],
            username: [r.oldUsername, r.newUsername],
          })),
        },
      });
      return { jobId: finished.id, summary, graduateUserIds: graduates.map((g) => g.userId) };
    },
    60000,
  );
  for (const userId of result.graduateUserIds) await revokeUserSessions(userId);
  return { jobId: result.jobId, summary: result.summary };
}

export async function listPromotionJobs(ctx: AuthedContext) {
  return inTenant(ctx, (tx) =>
    tx.job.findMany({
      where: { type: 'promotion' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, status: true, result: true, createdAt: true, finishedAt: true, createdBy: true },
    }),
  );
}

/** Students of a year grouped by section, for the promotion wizard. */
export async function promotionCandidates(ctx: AuthedContext, fromYearId: string) {
  return inTenant(ctx, async (tx) => {
    const sections = await tx.section.findMany({
      where: { class: { academicYearId: fromYearId } },
      include: {
        class: true,
        students: {
          where: { status: 'ACTIVE' },
          include: { user: { select: { displayName: true } } },
          orderBy: { rollNumber: 'asc' },
        },
      },
    });
    return sections
      .sort((a, b) => a.class.gradeLevel - b.class.gradeLevel || a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        label: sectionLabel(s),
        className: s.class.name,
        sectionName: s.name,
        gradeLevel: s.class.gradeLevel,
        students: s.students.map((st) => ({ id: st.id, name: st.user.displayName, rollNumber: st.rollNumber })),
      }));
  });
}
