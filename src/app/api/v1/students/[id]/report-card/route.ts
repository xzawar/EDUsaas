import { forbidden } from '@/server/http/errors';
import { defineRoute, idParam } from '@/server/http/route';
import { canViewMarks } from '@/server/school/assessments';
import { reportCardPdf } from '@/server/school/reportcard';

/** PDF report card. Teachers: only students in their sections (checked in the service). Admissions: no marks access. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'students.search',
  handler: async (ctx, { params }) => {
    if (!canViewMarks(ctx)) throw forbidden('You don’t have access to marks');
    return reportCardPdf(ctx, idParam(params));
  },
});
