import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, font, space } from '@/lib/theme';

/**
 * School Admin: set someone's sign-in directly (no old password needed). Students and teachers have a username;
 * office staff sign in with email. A new password works straight away and signs them out on other phones.
 */
export function LoginSheet({
  userId,
  name,
  username,
  email,
  onClose,
}: {
  userId: string;
  name: string;
  username: string | null;
  email: string | null;
  onClose: (changed: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [newUsername, setNewUsername] = useState(username ?? '');
  const [newEmail, setNewEmail] = useState(email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const pwOk = !password || (password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password));
  const changed =
    (!!username && newUsername.trim() !== username) || (!!email && newEmail.trim() !== email) || !!password;

  async function save() {
    setBusy(true);
    const body: Record<string, string> = {};
    if (username && newUsername.trim() !== username) body.username = newUsername.trim().toLowerCase();
    if (email && newEmail.trim() !== email) body.email = newEmail.trim().toLowerCase();
    if (password) body.password = password;
    const r = await api(`/users/${userId}/login`, { method: 'PATCH', body }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Sign-in updated');
    onClose(true);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={() => onClose(false)} />
        </View>
        <Text style={font.h1}>Sign-in</Text>
        <Text style={font.small}>{name}</Text>
        {username !== null && (
          <Field label="Username">
            <Input value={newUsername} onChangeText={setNewUsername} autoCapitalize="none" autoCorrect={false} />
          </Field>
        )}
        {email !== null && (
          <Field label="Email">
            <Input
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </Field>
        )}
        <Field
          label="New password"
          hint={pwOk ? '8+ characters, letters and numbers' : 'Use 8+ characters with a number'}
        >
          <Input
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Leave empty to keep it"
          />
        </Field>
        <Button onPress={save} loading={busy} disabled={!changed || !pwOk}>
          Save
        </Button>
      </ScrollView>
    </Modal>
  );
}
