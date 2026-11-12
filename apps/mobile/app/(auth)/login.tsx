import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PORTALS, type PortalSlug } from '@edusaas/shared';
import { Button, Field, Input } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';

export default function LoginScreen() {
  const { portal: raw } = useLocalSearchParams<{ portal: string }>();
  const portal = (PORTALS.find((p) => p.slug === raw)?.slug ?? 'student') as PortalSlug;
  const meta = PORTALS.find((p) => p.slug === portal)!;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signIn = useSession((s) => s.signIn);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!identifier.trim() || !password) return setError('Enter your sign-in details.');
    setBusy(true);
    setError(null);
    const r = await signIn(portal, identifier.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.message);
    // On success the gate in _layout routes to the app or the change-password screen.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Ionicons name="chevron-back" size={20} color={colors.muted} />
          <Text style={font.small}>Change portal</Text>
        </Pressable>
        <View>
          <Text style={font.h1}>{meta.title}</Text>
          <Text style={font.small}>{meta.blurb}</Text>
        </View>
        <Field label={meta.idLabel}>
          <Input
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            keyboardType={portal === 'platform' ? 'email-address' : 'default'}
            placeholder={
              portal === 'student'
                ? 'e.g. bss-8a-ahmad-14'
                : portal === 'staff'
                  ? 'username or email'
                  : 'you@edusaas.pk'
            }
            accessibilityLabel={meta.idLabel}
            value={identifier}
            onChangeText={setIdentifier}
            returnKeyType="next"
          />
        </Field>
        <Field label="Password">
          <View>
            <Input
              accessibilityLabel="Password"
              secureTextEntry={!show}
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              returnKeyType="go"
              onSubmitEditing={submit}
              style={{ paddingRight: 48 }}
            />
            <Pressable
              onPress={() => setShow((s) => !s)}
              hitSlop={10}
              style={{ position: 'absolute', right: 14, top: 14 }}
              accessibilityLabel={show ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
        </Field>
        {error && (
          <View style={{ backgroundColor: colors.redSoft, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#991b1b' }}>{error}</Text>
          </View>
        )}
        <Button onPress={submit} loading={busy}>
          Sign in
        </Button>
        <Text style={[font.tiny, { textAlign: 'center' }]}>
          {portal === 'student'
            ? 'Your username and first password are on the slip the school gave you.'
            : 'Forgot your password? Ask your school office to reset it.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
