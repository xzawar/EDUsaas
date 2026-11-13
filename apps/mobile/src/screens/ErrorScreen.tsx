import { Ionicons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, font } from '@/lib/theme';

/**
 * Shown instead of a crash when a screen throws while rendering. Expo Router uses it for every route below the
 * layout that exports it. Work saved offline is untouched; "Try again" re-renders the screen.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14 }}
    >
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.red} />
        <Text style={[font.h1, { textAlign: 'center' }]}>Something went wrong</Text>
        <Text style={[font.body, { textAlign: 'center' }]}>
          This screen hit a problem. Anything you saved on this phone is safe. Try again, or go back and open it again.
        </Text>
        <Text style={[font.tiny, { textAlign: 'center' }]} selectable>
          {error?.message?.slice(0, 200) ?? 'Unknown error'}
        </Text>
      </View>
      <Button icon="refresh-outline" onPress={() => void retry()}>
        Try again
      </Button>
    </ScrollView>
  );
}
