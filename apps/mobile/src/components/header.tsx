import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { colors, family } from '@/lib/theme';

/** Back button: a circular chip on the neutral tint (the system's navigation control). */
export function BackChip({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={8}
      onPress={onPress ?? (() => router.back())}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.cardStrong : colors.card,
        marginRight: 8,
      })}
    >
      <Ionicons name="arrow-back" size={22} color={colors.ink} />
    </Pressable>
  );
}

/** Stack header style: white, flat, title 20 SemiBold, back chip. Screens still opt in with headerShown. */
export const stackScreenOptions = {
  headerShown: false,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.bg },
  headerTitleStyle: { fontFamily: family.semibold, fontSize: 20, color: colors.ink },
  headerBackVisible: false,
  headerLeft: ({ canGoBack }: { canGoBack?: boolean }) => (canGoBack ? <BackChip /> : null),
  contentStyle: { backgroundColor: colors.bg },
} as const;
