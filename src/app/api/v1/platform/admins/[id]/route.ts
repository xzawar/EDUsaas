import { defineRoute, idParam } from '@/server/http/route';
import { updatePlatformAdmin, updatePlatformAdminSchema } from '@/server/platform/admins';

/** Change what a Platform Admin can do, or disable the account (signs them out at once). */
export const PATCH = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.admins.manage',
  input: updatePlatformAdminSchema,
  handler: async (ctx, { input, params }) => updatePlatformAdmin(ctx, idParam(params), input),
});
