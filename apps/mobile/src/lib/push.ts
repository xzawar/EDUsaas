import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import { APP_VERSION } from './config';
import { mapLink } from './links';
import { queryClient } from './query';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Registers this device for push once signed in, and routes notification taps to the right screen. */
export function usePushRegistration(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || !Device.isDevice) return;
    let cancelled = false;
    (async () => {
      try {
        if (Platform.OS === 'android')
          await Notifications.setNotificationChannelAsync('default', {
            name: 'EDUsaas',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        const perm = await Notifications.getPermissionsAsync();
        const status = perm.granted ? 'granted' : (await Notifications.requestPermissionsAsync()).status;
        if (status !== 'granted' || cancelled) return;
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        await api('/me/push-token', { body: { token, platform: Platform.OS, appVersion: APP_VERSION } });
      } catch {
        /* push is optional */
      }
    })();
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      void queryClient.invalidateQueries();
      const link = r.notification.request.content.data?.link as string | undefined;
      if (link) router.push(mapLink(link) as never);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, router]);
}

export { mapLink };
