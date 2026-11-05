import { notFound } from '@/server/http/errors';
import { defineRoute } from '@/server/http/route';
import { inTenant } from '@/server/school/common';
import { photoResponse } from '@/server/school/photos';

/** The signed-in student's or teacher's own photo (sidebar avatar). */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  handler: async (ctx) => {
    const who = await inTenant(ctx, async (tx) => {
      const s = await tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });
      if (s) return { kind: 'student' as const, id: s.id };
      const t = await tx.teacher.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });
      return t ? { kind: 'teacher' as const, id: t.id } : null;
    });
    if (!who) throw notFound('Photo');
    return photoResponse(ctx, who);
  },
});
