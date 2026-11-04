import { defineRoute } from '@/server/http/route';
import { currentScheme, saveScheme, schemeSchema } from '@/server/school/assessments';

export const GET = defineRoute({ auth: 'user', portals: ['STAFF'], handler: async (ctx) => ({ scheme: await currentScheme(ctx) }) });

export const PUT = defineRoute({ auth: 'user', portals: ['STAFF'], permission: 'settings.manage', input: schemeSchema, handler: async (ctx, { input }) => saveScheme(ctx, input) });
