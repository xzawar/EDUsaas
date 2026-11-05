import { defineRoute, idParam } from '@/server/http/route';
import { decideSupport, supportDecisionSchema } from '@/server/school/support';

/** School Admin approves, denies, or ends EDUsaas support access. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  input: supportDecisionSchema,
  handler: async (ctx, { input, params }) => decideSupport(ctx, idParam(params), input),
});
