import { defineRoute } from '@/server/http/route';
import { MOBILE_MIN_VERSION, MOBILE_RELEASE } from '@/server/mobile/release';

/** Read by the app on launch: is this build still supported, and where is the latest APK. */
export const GET = defineRoute({
  auth: 'public',
  handler: async () => ({
    minVersion: MOBILE_MIN_VERSION,
    latest: MOBILE_RELEASE,
    serverTime: new Date().toISOString(),
    portals: ['student', 'staff', 'platform'],
  }),
});
