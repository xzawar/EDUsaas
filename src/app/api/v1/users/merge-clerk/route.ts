import { defineRoute } from '@/server/http/route';
import { mergeClerkSchema, mergeIntoClerk } from '@/server/school/people';

/** Fold an Accountant and an Admissions Officer into one Clerk seat. */
export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  permission: 'users.manage',
  input: mergeClerkSchema,
  handler: async (ctx, { input }) => mergeIntoClerk(ctx, input),
});
