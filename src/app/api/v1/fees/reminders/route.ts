import { defineRoute } from '@/server/http/route';
import { reminderSchema, sendFeeReminders } from '@/server/school/finance/reminders';

/** Remind students with past-due bills (all of them, or the ones picked). */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'fees.collect',
  input: reminderSchema,
  handler: async (ctx, { input }) => sendFeeReminders(ctx, input),
});
