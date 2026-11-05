import { defineRoute } from '@/server/http/route';
import { createPlatformAdmin, createPlatformAdminSchema, listPlatformAdmins } from '@/server/platform/admins';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.admins.manage',
  handler: async () => listPlatformAdmins(),
});

/** Creates a Platform Admin with a one-time password (forced change at first sign-in). */
export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.admins.manage',
  input: createPlatformAdminSchema,
  handler: async (ctx, { input }) => ({ status: 201, body: { admin: await createPlatformAdmin(ctx, input) } }),
});
