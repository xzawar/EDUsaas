import { defineRoute, idParam } from '@/server/http/route';
import { adminResetSchema, emergencyAdminReset } from '@/server/platform/support';

/** Emergency: reset a locked-out School Admin. Needs a reason and typed confirmation; the school is told. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  input: adminResetSchema,
  handler: async (ctx, { input, params }) => emergencyAdminReset(ctx, idParam(params), input),
});
