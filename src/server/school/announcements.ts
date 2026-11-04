import 'server-only';
import type { AnnouncementAudience, Prisma } from '@prisma/client';
import { z } from 'zod';
import type { TenantTx } from '@/server/db/client';
import { AppError, notFound } from '@/server/http/errors';
import type { AuthedContext } from '@/server/http/route';
import { audit, inTenant, isoDate, schoolClock, sectionLabel, teacherScope, toDate } from '@/server/school/common';
import { notify } from '@/server/school/notifications';

/** Announcements (spec §8.11): everyone / staff / students / one section. Posting notifies the audience in-app. */

export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3, 'Give it a short title').max(120),
    body: z.string().trim().min(1, 'Write the message').max(4000),
    audience: z.enum(['EVERYONE', 'STAFF', 'STUDENTS', 'SECTION']),
    sectionId: z.string().uuid().nullable().optional(),
    pinned: z.boolean().default(false),
    expiresOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((v) => (v.audience === 'SECTION') === !!v.sectionId, { message: 'Choose a section', path: ['sectionId'] });

const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  EVERYONE: 'Everyone',
  STAFF: 'All staff',
  STUDENTS: 'All students',
  SECTION: 'Section',
};

async function mySections(ctx: AuthedContext, tx: TenantTx): Promise<string[]> {
  if (ctx.user.role === 'STUDENT') {
    const s = await tx.student.findUnique({ where: { userId: ctx.user.id }, select: { sectionId: true } });
    return s?.sectionId ? [s.sectionId] : [];
  }
  if (ctx.user.role === 'TEACHER') return (await teacherScope(tx, ctx.user.id)).sectionIds;
  return [];
}

/** What the caller can see. Managers also see expired posts (marked), so they can tidy up. */
export async function listAnnouncements(ctx: AuthedContext, opts: { limit?: number; manage?: boolean } = {}) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    const manager = opts.manage && ctx.can('announcements.manage');
    const isStudent = ctx.user.role === 'STUDENT';
    const sections = await mySections(ctx, tx);
    const where: Prisma.AnnouncementWhereInput = manager
      ? { deletedAt: null }
      : {
          deletedAt: null,
          OR: [{ expiresOn: null }, { expiresOn: { gte: toDate(clock.today) } }],
          AND: [
            {
              OR: [
                { audience: 'EVERYONE' },
                { audience: isStudent ? 'STUDENTS' : 'STAFF' },
                ...(sections.length ? [{ audience: 'SECTION' as const, sectionId: { in: sections } }] : []),
                // Staff overseers (admin, principal) see section posts too.
                ...(!isStudent && ctx.user.role !== 'TEACHER' ? [{ audience: 'SECTION' as const }] : []),
              ],
            },
          ],
        };
    const rows = await tx.announcement.findMany({
      where,
      include: { author: { select: { displayName: true } }, section: { include: { class: true } } },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: opts.limit ?? 50,
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      audienceLabel: a.audience === 'SECTION' && a.section ? sectionLabel(a.section) : AUDIENCE_LABEL[a.audience],
      pinned: a.pinned,
      author: a.author.displayName,
      createdAt: a.createdAt,
      expiresOn: isoDate(a.expiresOn),
      expired: !!a.expiresOn && isoDate(a.expiresOn)! < clock.today,
    }));
  });
}

export async function createAnnouncement(ctx: AuthedContext, input: z.infer<typeof createAnnouncementSchema>) {
  return inTenant(ctx, async (tx) => {
    const clock = await schoolClock(tx);
    if (input.expiresOn && input.expiresOn < clock.today)
      throw new AppError('VALIDATION_FAILED', 'The end date is in the past');
    let label = AUDIENCE_LABEL[input.audience];
    if (input.sectionId) {
      const s = await tx.section.findUnique({ where: { id: input.sectionId }, include: { class: true } });
      if (!s) throw notFound('Section');
      label = sectionLabel(s);
    }
    const a = await tx.announcement.create({
      data: {
        tenantId: ctx.tenantId!,
        title: input.title,
        body: input.body,
        audience: input.audience,
        sectionId: input.sectionId ?? null,
        pinned: input.pinned,
        expiresOn: input.expiresOn ? toDate(input.expiresOn) : null,
        createdBy: ctx.user.id,
      },
    });

    // Recipients: active users in the audience (not the author).
    const active = { status: 'ACTIVE' as const, deletedAt: null, id: { not: ctx.user.id } };
    let recipients: { id: string }[] = [];
    if (input.audience === 'EVERYONE') recipients = await tx.user.findMany({ where: active, select: { id: true } });
    else if (input.audience === 'STAFF')
      recipients = await tx.user.findMany({ where: { ...active, role: { not: 'STUDENT' } }, select: { id: true } });
    else if (input.audience === 'STUDENTS')
      recipients = await tx.user.findMany({ where: { ...active, role: 'STUDENT' }, select: { id: true } });
    else {
      const [students, teachers] = await Promise.all([
        tx.student.findMany({ where: { sectionId: input.sectionId!, status: 'ACTIVE' }, select: { userId: true } }),
        tx.teacherAssignment.findMany({
          where: { sectionId: input.sectionId! },
          select: { teacher: { select: { userId: true } } },
        }),
      ]);
      const incharge = await tx.section.findUnique({
        where: { id: input.sectionId! },
        select: { classTeacher: { select: { userId: true } } },
      });
      recipients = [
        ...students.map((s) => ({ id: s.userId })),
        ...teachers.map((t) => ({ id: t.teacher.userId })),
        ...(incharge?.classTeacher ? [{ id: incharge.classTeacher.userId }] : []),
      ].filter((r) => r.id !== ctx.user.id);
    }
    const ids = [...new Set(recipients.map((r) => r.id))];
    const studentIds = new Set(
      (await tx.user.findMany({ where: { id: { in: ids }, role: 'STUDENT' }, select: { id: true } })).map((u) => u.id),
    );
    const body = input.body.length > 140 ? `${input.body.slice(0, 137)}…` : input.body;
    await notify(
      tx,
      ctx.tenantId!,
      ids.filter((id) => studentIds.has(id)),
      { kind: 'announcement', title: input.title, body, link: '/student' },
    );
    await notify(
      tx,
      ctx.tenantId!,
      ids.filter((id) => !studentIds.has(id)),
      { kind: 'announcement', title: input.title, body, link: '/staff/announcements' },
    );
    await audit(ctx, tx, {
      action: 'announcement.create',
      entity: 'Announcement',
      entityId: a.id,
      after: { title: input.title, audience: label, recipients: ids.length },
    });
    return { id: a.id, recipients: ids.length };
  });
}

export async function deleteAnnouncement(ctx: AuthedContext, id: string) {
  return inTenant(ctx, async (tx) => {
    const a = await tx.announcement.findUnique({ where: { id } });
    if (!a || a.deletedAt) throw notFound('Announcement');
    await tx.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(ctx, tx, {
      action: 'announcement.delete',
      entity: 'Announcement',
      entityId: id,
      before: { title: a.title },
    });
    return { ok: true };
  });
}
