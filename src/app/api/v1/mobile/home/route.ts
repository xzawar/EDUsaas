import { defineRoute } from '@/server/http/route';
import { mobileHome } from '@/server/mobile/home';

/** One call for the app's first screen: whatever this role's dashboard shows, in JSON. */
export const GET = defineRoute({
  auth: 'user',
  handler: async (ctx) => mobileHome(ctx),
});
