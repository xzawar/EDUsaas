import { defineRoute, idParam } from '@/server/http/route';
import { updateFeeHead, updateFeeHeadSchema } from '@/server/school/finance/setup';

export const PATCH = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.manage',
  input: updateFeeHeadSchema,
  handler: async (ctx, { input, params }) => ({ head: await updateFeeHead(ctx, idParam(params), input) }),
});
