import Constants from 'expo-constants';

/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL at build time (e.g. the Vercel URL); a dev build falls back to the
 * Metro host so `expo start` talks to a local `next dev` on the same machine.
 */
function devHost(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : null;
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? devHost() ?? 'https://edusaas-tau.vercel.app').replace(
  /\/$/,
  '',
);
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const CLIENT_HEADER = `android/${APP_VERSION}`;
