import { defineRoute } from '@/server/http/route';
import { platformHealth } from '@/server/platform/tenants';

export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.health.read',
  handler: async () => platformHealth(),
});
