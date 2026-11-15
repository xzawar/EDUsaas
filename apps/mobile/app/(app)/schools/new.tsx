import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Field, Input, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useInvalidate } from '@/lib/data';
import { colors, font } from '@/lib/theme';

type Created = {
  tenant: { id: string; name: string; prefix: string };
  schoolAdmin: { email: string; temporaryPassword: string };
};

/** Add a school: its name, a short prefix for usernames, and the School Admin who will set it up. */
export default function NewSchoolScreen() {
  const router = useRouter();
  const invalidate = useInvalidate();
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [city, setCity] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Created | null>(null);
  const ready =
    name.trim().length >= 2 &&
    /^[a-z0-9]{2,10}$/.test(prefix) &&
    adminName.trim().length >= 2 &&
    /\S+@\S+\.\S+/.test(adminEmail);

  async function save() {
    setBusy(true);
    const r = await api<Created>('/platform/tenants', {
      body: {
        name: name.trim(),
        prefix,
        city: city.trim() || undefined,
        admin: { displayName: adminName.trim(), email: adminEmail.trim().toLowerCase() },
      },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    invalidate('/platform');
    setDone(r.data);
  }

  if (done)
    return (
      <Screen back title="School added">
        <Card>
          <Text style={font.title}>{done.tenant.name}</Text>
          <Text style={font.small}>Usernames start with “{done.tenant.prefix}-”</Text>
        </Card>
        <Card title="School Admin sign-in">
          <Row
            title="Email"
            right={
              <Text selectable style={{ fontWeight: '700', color: colors.ink }}>
                {done.schoolAdmin.email}
              </Text>
            }
          />
          <Row
            title="Password"
            right={
              <Text selectable style={{ fontWeight: '700', color: colors.ink }}>
                {done.schoolAdmin.temporaryPassword}
              </Text>
            }
          />
          <Text style={font.tiny}>Shown once. They choose their own password at first sign-in.</Text>
        </Card>
        <Button
          onPress={() => router.replace({ pathname: '/(app)/schools/[id]', params: { id: done.tenant.id } } as never)}
        >
          Open school
        </Button>
      </Screen>
    );

  return (
    <Screen back title="New school">
      <Field label="School name">
        <Input value={name} onChangeText={setName} autoCapitalize="words" />
      </Field>
      <Field label="Prefix" hint="2–10 letters or digits, used in usernames">
        <Input
          value={prefix}
          onChangeText={(t) =>
            setPrefix(
              t
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '')
                .slice(0, 10),
            )
          }
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="e.g. bss"
        />
      </Field>
      <Field label="City (optional)">
        <Input value={city} onChangeText={setCity} autoCapitalize="words" />
      </Field>
      <Field label="School Admin name">
        <Input value={adminName} onChangeText={setAdminName} autoCapitalize="words" />
      </Field>
      <Field label="School Admin email">
        <Input value={adminEmail} onChangeText={setAdminEmail} autoCapitalize="none" keyboardType="email-address" />
      </Field>
      <Button onPress={save} loading={busy} disabled={!ready}>
        Add school
      </Button>
    </Screen>
  );
}
