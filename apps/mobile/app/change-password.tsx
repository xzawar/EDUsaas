import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { Button, Field, Input, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { api, setToken } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';

/** Same rule as the server (newPasswordSchema): 8+ characters with a letter and a number. */
function problem(p: string) {
  if (p.length < 8) return 'At least 8 characters';
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) return 'Use letters and numbers';
  return null;
}

/** One password box with a show/hide eye, so people can check what they typed. */
function Secret({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        style={{ paddingRight: 52 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
        onPress={() => setShown(!shown)}
        hitSlop={8}
        style={{ position: 'absolute', right: 14 }}
      >
        <Icon name={shown ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const { me, refresh, signOut } = useSession();
  const router = useRouter();
  const forced = !!me?.user.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rule = next ? problem(next) : null;
  const mismatch = !!confirm && confirm !== next;
  const ready = !!current && !problem(next) && confirm === next;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const r = await api<{ token?: string }>('/auth/change-password', {
      body: { currentPassword: current, newPassword: next },
    }).catch(() => null);
    setBusy(false);
    if (!r) return setError('No connection. Try again.');
    if (!r.ok) return setError(r.error.message);
    // The server revokes the old session and hands this phone a new one.
    if (r.data.token) await setToken(r.data.token);
    toast('success', 'Password changed');
    await refresh();
    if (!forced && router.canGoBack?.()) router.back();
  }

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen
        title={forced ? 'Your password' : 'New password'}
        subtitle={forced ? 'Choose your own to continue.' : 'Your other devices will be signed out.'}
        right={!forced && router.canGoBack?.() ? <BackChip /> : undefined}
      >
        <Field label={forced ? 'Temporary password' : 'Current password'}>
          <Secret label={forced ? 'Temporary password' : 'Current password'} value={current} onChange={setCurrent} />
        </Field>
        <Field label="New password" hint={rule ?? '8+ characters, letters and numbers'}>
          <Secret label="New password" value={next} onChange={setNext} />
        </Field>
        <Field label="Type it again" hint={mismatch ? 'Doesn’t match yet' : undefined}>
          <Secret label="Confirm new password" value={confirm} onChange={setConfirm} />
        </Field>
        {!!error && <Text style={[font.small, { color: colors.red }]}>{error}</Text>}
        <View style={{ marginTop: space.sm, gap: space.sm }}>
          <Button onPress={submit} loading={busy} disabled={!ready}>
            Save password
          </Button>
          {forced && (
            <Button variant="ghost" onPress={signOut}>
              Sign out
            </Button>
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
