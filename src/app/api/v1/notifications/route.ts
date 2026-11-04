import { defineRoute } from '@/server/http/route';
import { z } from 'zod';
import { markNotificationsRead, myNotifications } from '@/server/school/notifications';

export const GET = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  handler: async (ctx) => myNotifications(ctx),
});

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF', 'STUDENT'],
  input: z.object({ ids: z.array(z.string().uuid()).max(100).optional() }),
  handler: async (ctx, { input }) => markNotificationsRead(ctx, input.ids),
});
