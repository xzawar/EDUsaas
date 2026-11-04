import { defineRoute } from '@/server/http/route';
import { AppError } from '@/server/http/errors';
import { inTenant } from '@/server/school/common';
import { studentAttendance } from '@/server/school/attendance';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STUDENT'],
  permission: 'self.records',
  handler: async (ctx) => {
    const s = await inTenant(ctx, (tx) => tx.student.findUnique({ where: { userId: ctx.user.id }, select: { id: true } }));
    if (!s) throw new AppError('NOT_FOUND', 'Student record not found');
    return studentAttendance(ctx, s.id);
  },
});
