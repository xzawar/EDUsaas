import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/lib/query';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';
import { usePushRegistration } from '@/lib/push';
import { ToastHost } from '@/components/toast';
import { useUpdateCheck } from '@/lib/update';
import { UpdateRequired } from '@/screens/UpdateRequired';
import { loadLock, useLock, useRelockOnResume } from '@/lib/lock';
import { LockScreen } from '@/screens/LockScreen';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Auth gate: signed out → (auth); must change password → change-password; otherwise the role's tabs. */
function Gate() {
  const { status, me, boot } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    void boot();
    void loadLock();
  }, [boot]);
  useRelockOnResume();
  const locked = useLock((l) => l.locked);
  useEffect(() => {
    if (status === 'loading') return;
    void SplashScreen.hideAsync().catch(() => undefined);
    const inAuth = segments[0] === '(auth)';
    const onChange = segments[0] === 'change-password';
    if (status === 'out' && !inAuth) router.replace('/(auth)/portal');
    else if (status === 'in' && me?.user.mustChangePassword && !onChange) router.replace('/change-password');
    else if (status === 'in' && !me?.user.mustChangePassword && (inAuth || onChange)) router.replace('/(app)');
  }, [status, me?.user.mustChangePassword, segments, router]);
  usePushRegistration(status === 'in' && !me?.user.mustChangePassword);
  const update = useUpdateCheck();
  if (update.required) return <UpdateRequired latest={update.available} />;
  if (status === 'in' && locked) return <LockScreen />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="change-password" options={{ headerShown: true, title: 'Change password' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <StatusBar style="dark" />
          <Gate />
          <ToastHost />
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
