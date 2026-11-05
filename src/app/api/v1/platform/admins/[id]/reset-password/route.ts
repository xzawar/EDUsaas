import { defineRoute, idParam } from '@/server/http/route';
import { resetPlatformAdminPassword } from '@/server/platform/admins';

export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.admins.manage',
  handler: async (ctx, { params }) => resetPlatformAdminPassword(ctx, idParam(params)),
});
