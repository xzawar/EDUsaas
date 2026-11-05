import { defineRoute } from '@/server/http/route';
import { setOne, setOneSchema } from '@/server/school/attendance';

export const POST = defineRoute({
  auth: 'user',
  portals: ['STAFF'],
  input: setOneSchema,
  handler: async (ctx, { input }) => setOne(ctx, input),
});
