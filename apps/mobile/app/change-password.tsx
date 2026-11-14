import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Field, Input } from '@/components/ui';
import { api, setToken } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';
import { toast } from '@/components/toast';

const RULES = 'At least 10 characters, with a letter and a number.';

export default function ChangePasswordScreen() {
  const { me, refresh, signOut } = useSession();
  const forced = !!me?.user.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    if (next !== confirm) return setError('The two new passwords don’t match.');
    setBusy(true);
    setError(null);
    const r = await api<{ token?: string }>('/auth/change-password', {
      body: { currentPassword: current, newPassword: next },
    }).catch(() => null);
    setBusy(false);
    if (!r) return setError('No connection.');
    if (!r.ok) return setError(r.error.message);
    // The server revokes the old session and hands this phone a new one.
    if (r.data.token) await setToken(r.data.token);
    toast('success', 'Password changed');
    await refresh();
  }
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
      {forced && (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderRadius: 16, padding: 16 }}>
          <Ionicons name="key" size={20} color={colors.deep} />
          <Text style={{ flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22 }}>
            Welcome! This is your first sign-in, so choose your own password to continue.
          </Text>
        </View>
      )}
      <Field label={forced ? 'Temporary password' : 'Current password'}>
        <Input
          secureTextEntry
          accessibilityLabel={forced ? 'Temporary password' : 'Current password'}
          value={current}
          onChangeText={setCurrent}
        />
      </Field>
      <Field label="New password" hint={RULES}>
        <Input secureTextEntry accessibilityLabel="New password" value={next} onChangeText={setNext} />
      </Field>
      <Field label="Confirm new password">
        <Input secureTextEntry accessibilityLabel="Confirm new password" value={confirm} onChangeText={setConfirm} />
      </Field>
      {!!error && <Text style={{ color: colors.red }}>{error}</Text>}
      <Button onPress={submit} loading={busy} disabled={!current || next.length < 10}>
        Save password
      </Button>
      <Button variant="ghost" onPress={signOut}>
        Sign out
      </Button>
      <Text style={font.tiny}>Your other sessions are signed out when you change your password.</Text>
    </ScrollView>
  );
}
