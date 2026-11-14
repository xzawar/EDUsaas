import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { DEMO_LOGINS, DEMO_PASSWORD, type DemoLogin } from '@/lib/dev-logins';
import { useSession } from '@/lib/session';
import { colors, font, radius, space } from '@/lib/theme';

/**
 * Hidden developer quick-sign-in: a sheet of one-tap logins for the public demo accounts, so testing a demo build
 * needs no typing. Revealed only by a secret gesture (see the portal screen). It calls the normal sign-in, so the
 * server still verifies the password; on a non-demo server the accounts do not exist and the taps just fail.
 */
export function DevSignIn({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [busy, setBusy] = useState<string | null>(null);

  async function go(d: DemoLogin) {
    setBusy(d.identifier);
    const r = await signIn(d.portal, d.identifier, DEMO_PASSWORD);
    setBusy(null);
    if (!r.ok) return toast('error', r.message);
    // The auth gate in app/_layout routes to the app (or the change-password screen) on success.
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            paddingTop: space.lg,
            paddingBottom: insets.bottom + space.lg,
            maxHeight: '85%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="construct-outline" size={20} color={colors.deep} />
              <Text style={font.title}>Developer sign-in</Text>
            </View>
            <Text style={[font.small, { marginTop: space.sm }]}>
              One-tap demo logins. Testing only; the server still checks each account.
            </Text>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm }}>
            {DEMO_LOGINS.map((d) => (
              <Pressable
                key={d.identifier}
                onPress={() => go(d)}
                disabled={!!busy}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  backgroundColor: pressed ? colors.cardStrong : colors.card,
                  borderRadius: radius.lg,
                  padding: space.lg,
                  opacity: busy && busy !== d.identifier ? 0.5 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{d.label}</Text>
                  <Text style={font.tiny}>{d.sub}</Text>
                </View>
                <Ionicons
                  name={busy === d.identifier ? 'ellipsis-horizontal' : 'chevron-forward'}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
