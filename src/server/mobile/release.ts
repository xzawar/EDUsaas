import 'server-only';
import releases from '../../../mobile/releases.json';

/**
 * The app checks this on launch (spec §3.3). Bump `minVersion` only when an old build can no longer talk to the API.
 * `mobile/releases.json` is updated by the APK release workflow.
 */
export const MOBILE_MIN_VERSION = releases.minVersion;
export const MOBILE_RELEASE = releases.latest;
