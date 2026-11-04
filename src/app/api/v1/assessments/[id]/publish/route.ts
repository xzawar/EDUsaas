import { defineRoute, idParam } from '@/server/http/route';
import { publishAssessment } from '@/server/school/assessments';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => publishAssessment(ctx, idParam(params)),
});
