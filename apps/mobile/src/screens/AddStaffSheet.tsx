import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Input, Row } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, font, space } from '@/lib/theme';

type Role = 'TEACHER' | 'PRINCIPAL' | 'ACCOUNTANT' | 'ADMISSIONS_OFFICER' | 'CLERK';
const ROLES: { k: Role; label: string; hint: string }[] = [
  { k: 'TEACHER', label: 'Teacher', hint: 'Signs in with a username' },
  { k: 'PRINCIPAL', label: 'Principal', hint: 'Teaching and people, no money' },
  { k: 'ACCOUNTANT', label: 'Accountant', hint: 'Fees, expenses, payroll' },
  { k: 'ADMISSIONS_OFFICER', label: 'Admissions', hint: 'Adds and edits students' },
  { k: 'CLERK', label: 'Clerk', hint: 'Accountant + admissions in one' },
];

type Done = { name: string; login: string; temporaryPassword: string };

/** Add anyone on the staff: teachers sign in with a username, office staff with their email. */
export function AddStaffSheet({ onClose }: { onClose: (added: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState<Role>('TEACHER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const teacher = role === 'TEACHER';
  const ready = name.trim().length >= 2 && (teacher || /\S+@\S+\.\S+/.test(email));

  async function save() {
    setBusy(true);
    const r = teacher
      ? await api<{ username: string; temporaryPassword: string }>('/teachers', {
          body: { displayName: name.trim(), phone: phone.trim() || undefined },
        }).catch(() => null)
      : await api<{ email: string; temporaryPassword: string }>('/staff', {
          body: { role, displayName: name.trim(), email: email.trim().toLowerCase() },
        }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    const data = r.data as { username?: string; email?: string; temporaryPassword: string };
    setDone({ name: name.trim(), login: data.username ?? data.email ?? '', temporaryPassword: data.temporaryPassword });
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(!!done)}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, paddingBottom: 40, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={() => onClose(!!done)} />
        </View>
        {done ? (
          <>
            <Text style={font.h1}>Added</Text>
            <Card>
              <Text style={font.title}>{done.name}</Text>
              <Text style={font.small}>{ROLES.find((x) => x.k === role)?.label}</Text>
            </Card>
            <Card title="Their sign-in">
              <Row
                title={teacher ? 'Username' : 'Email'}
                right={
                  <Text selectable style={{ fontWeight: '700', color: colors.ink }}>
                    {done.login}
                  </Text>
                }
              />
              <Row
                title="Password"
                right={
                  <Text selectable style={{ fontWeight: '700', color: colors.ink }}>
                    {done.temporaryPassword}
                  </Text>
                }
              />
              <Text style={font.tiny}>They choose their own password the first time they sign in.</Text>
            </Card>
            <Button onPress={() => onClose(true)}>Done</Button>
          </>
        ) : (
          <>
            <Text style={font.h1}>Add staff</Text>
            <Field label="Role" hint={ROLES.find((x) => x.k === role)?.hint}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ROLES.map((x) => (
                  <Chip key={x.k} active={role === x.k} onPress={() => setRole(x.k)}>
                    {x.label}
                  </Chip>
                ))}
              </View>
            </Field>
            <Field label="Full name">
              <Input
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                maxLength={120}
                accessibilityLabel="Full name"
              />
            </Field>
            {teacher ? (
              <Field label="Phone (optional)" hint="Students see it on their teacher’s card">
                <Input
                  value={phone}
                  onChangeText={setPhone}
                  accessibilityLabel="Phone"
                  keyboardType="phone-pad"
                  placeholder="03XX XXXXXXX"
                />
              </Field>
            ) : (
              <Field label="Email" hint="They sign in with this">
                <Input
                  accessibilityLabel="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </Field>
            )}
            <Button onPress={save} loading={busy} disabled={!ready}>
              Add {ROLES.find((x) => x.k === role)?.label.toLowerCase()}
            </Button>
          </>
        )}
      </ScrollView>
    </Modal>
  );
}
