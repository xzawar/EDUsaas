import { defineRoute, idParam } from '@/server/http/route';
import { continueYearArchive } from '@/server/school/archives';

/** Archive the next chunk of report cards now. Safe to repeat. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'promotion.run',
  handler: async (ctx, { params }) => continueYearArchive(ctx, idParam(params)),
});
