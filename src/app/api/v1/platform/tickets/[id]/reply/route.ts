import { defineRoute, idParam } from '@/server/http/route';
import { platformReplySchema, replyAsPlatform } from '@/server/platform/tickets';

export const POST = defineRoute({
  auth: 'user',
  portals: ['PLATFORM'],
  permission: 'platform.support.queue',
  input: platformReplySchema,
  handler: async (ctx, { input, params }) => replyAsPlatform(ctx, idParam(params), input),
});
