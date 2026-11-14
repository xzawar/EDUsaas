import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { tabsFor } from '@/lib/nav';
import { colors } from '@/lib/theme';
export { ErrorBoundary } from '@/screens/ErrorScreen';

/** Bottom tabs chosen by role. Every file under (app) exists for every role; only the chosen ones get a tab. */
export default function AppLayout() {
  const me = useSession((s) => s.me);
  const insets = useSafeAreaInsets();
  const pendingCount = useQueue((s) => s.items.length);
  // Every screen below reads the signed-in profile. Until it has loaded (cold start) or after it is cleared
  // (sign-out, expired session) render nothing; the root gate is already routing to the right place.
  if (!me) return null;
  const tabs = tabsFor(me);
  const shown = new Set(tabs.map((t) => t.name));
  const all = [
    'index',
    'attendance',
    'marks',
    'fees',
    'leave',
    'collect',
    'invoices',
    'claims',
    'students',
    'announcements',
    'finance',
    'schools',
    'tickets',
    'more',
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          height: 60 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {all.map((name) => {
        const t = tabs.find((x) => x.name === name);
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              // Hide only the button: `href: null` would make Expo Router redirect away from the screen, which
              // breaks every More-menu link to a screen that is not a tab for this role.
              ...(shown.has(name) ? {} : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } }),
              title: t?.title ?? name,
              tabBarIcon: ({ color, size }) => (
                <View>
                  <Ionicons name={t?.icon ?? 'ellipse-outline'} size={size} color={String(color)} />
                  {name === 'more' && pendingCount > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        right: -6,
                        top: -4,
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: colors.amber,
                      }}
                    />
                  )}
                </View>
              ),
            }}
          />
        );
      })}
    </Tabs>
  );
}
