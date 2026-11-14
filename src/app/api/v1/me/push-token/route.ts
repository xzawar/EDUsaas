import { z } from 'zod';
import { defineRoute } from '@/server/http/route';
import { pushTokenSchema, registerPushToken, removePushToken } from '@/server/auth/push';

export const POST = defineRoute({
  auth: 'user',
  input: pushTokenSchema,
  handler: async (ctx, { input }) => registerPushToken(ctx, input),
});

export const DELETE = defineRoute({
  auth: 'user',
  allowPendingPasswordChange: true,
  input: z.object({ token: z.string().max(200) }),
  handler: async (ctx, { input }) => removePushToken(ctx, input.token),
});
