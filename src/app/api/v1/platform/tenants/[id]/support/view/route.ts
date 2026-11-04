import { defineRoute, idParam } from '@/server/http/route';
import { supportView } from '@/server/platform/support';

/** Read-only school overview — only while the school's grant is active; each view is audited in the school. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.tenants.manage',
  handler: async (ctx, { params }) => supportView(ctx, idParam(params)),
});
