import { defineRoute } from '@/server/http/route';
import { studentResults } from '@/server/school/assessments';

export const GET = defineRoute({ auth: 'user', portals: ['STUDENT'], permission: 'self.records', handler: async (ctx) => studentResults(ctx) });
