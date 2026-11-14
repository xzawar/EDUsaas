import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { unlock } from '@/lib/lock';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';

/** Covers the app until the person unlocks. Signing out is always possible, so nobody is stuck. */
export function LockScreen() {
  const signOut = useSession((s) => s.signOut);
  const name = useSession((s) => s.me?.user.displayName);
  useEffect(() => {
    void unlock();
  }, []);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        gap: 14,
      }}
    >
      <Ionicons name="lock-closed-outline" size={44} color={colors.accent} />
      <Text style={font.h1}>EDUsaas is locked</Text>
      {name ? <Text style={font.small}>Signed in as {name}</Text> : null}
      <Button icon="finger-print-outline" onPress={() => void unlock()}>
        Unlock
      </Button>
      <Button variant="ghost" onPress={() => void signOut()}>
        Sign out instead
      </Button>
    </View>
  );
}
