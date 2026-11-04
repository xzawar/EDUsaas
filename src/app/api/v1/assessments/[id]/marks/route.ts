import { defineRoute, idParam } from '@/server/http/route';
import { saveMarks, saveMarksSchema } from '@/server/school/assessments';

export const PUT = defineRoute({ auth: 'user', portals: ['STAFF'], input: saveMarksSchema, handler: async (ctx, { input, params }) => saveMarks(ctx, idParam(params), input) });
