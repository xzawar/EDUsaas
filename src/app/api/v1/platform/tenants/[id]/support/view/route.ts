import { forbidden } from '@/server/http/errors';
import { defineRoute, idParam } from '@/server/http/route';
import { canUseSupportAccess, supportView } from '@/server/platform/support';

/** Read-only school overview — only while this person's grant is active; each view is audited in the school. */
export const GET = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  handler: async (ctx, { params }) => {
    if (!canUseSupportAccess(ctx)) throw forbidden('You do not have permission to do this');
    return supportView(ctx, idParam(params));
  },
});
