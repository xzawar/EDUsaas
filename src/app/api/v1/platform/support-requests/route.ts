import { defineRoute } from '@/server/http/route';
import { awaitingOwner } from '@/server/platform/support';

/** Platform Admins' support-access requests waiting for the Platform Owner. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  handler: async () => ({ items: await awaitingOwner() }),
});
