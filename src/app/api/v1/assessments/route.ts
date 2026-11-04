import { defineRoute } from '@/server/http/route';
import {
  createAssessment,
  createAssessmentSchema,
  listAssessments,
  listAssessmentsQuery,
} from '@/server/school/assessments';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  query: listAssessmentsQuery,
  handler: async (ctx, { query }) => ({ items: await listAssessments(ctx, query) }),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  input: createAssessmentSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { assessment: await createAssessment(ctx, input) } }),
});
