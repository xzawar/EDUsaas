import { defineRoute } from '@/server/http/route';
import { appStats } from '@/server/platform/stats';

/** App-wide usage, load and database health for the Platform Owner. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.health.read',
  handler: async () => appStats(),
});
