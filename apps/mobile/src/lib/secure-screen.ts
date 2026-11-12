import { usePreventScreenCapture } from 'expo-screen-capture';

/** Blocks screenshots and the recent-apps preview while a screen shows money records (spec §3.6, FLAG_SECURE). */
export function useSecureScreen(key: string) {
  usePreventScreenCapture(key);
}
