import { defineRoute, idParam } from '@/server/http/route';
import { deleteAssessment, getAssessment } from '@/server/school/assessments';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => ({ assessment: await getAssessment(ctx, idParam(params)) }),
});

export const DELETE = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  handler: async (ctx, { params }) => deleteAssessment(ctx, idParam(params)),
});
