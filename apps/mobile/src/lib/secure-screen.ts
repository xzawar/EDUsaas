import { useFocusEffect } from 'expo-router';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useCallback } from 'react';

/**
 * Blocks screenshots and the recent-apps preview while a screen showing money records is in view (spec §3.6,
 * FLAG_SECURE). Tied to focus, not mounting: tab screens stay mounted, and the block must lift when the person moves on.
 */
export function useSecureScreen(key: string) {
  useFocusEffect(
    useCallback(() => {
      void preventScreenCaptureAsync(key).catch(() => undefined);
      return () => void allowScreenCaptureAsync(key).catch(() => undefined);
    }, [key]),
  );
}
