import { defineRoute } from '@/server/http/route';
import { getRolePermissions, updateRolePermissions, updateRolePermissionsSchema } from '@/server/school/settings';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  handler: async (ctx) => ({ roles: await getRolePermissions(ctx) }),
});

export const PUT = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'settings.manage',
  input: updateRolePermissionsSchema,
  handler: async (ctx, { input }) => ({ roles: await updateRolePermissions(ctx, input) }),
});
