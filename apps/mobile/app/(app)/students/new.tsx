import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useGet, useInvalidate } from '@/lib/data';
import { colors, font } from '@/lib/theme';

type Sections = { items: { id: string; label: string; studentCount: number; capacity: number | null }[] };
type Created = {
  id: string;
  name: string;
  username: string;
  rollNumber: number;
  section: string;
  temporaryPassword: string;
};

/** Admit a student: name, class and a guardian. The app shows the new sign-in to hand over. */
export default function NewStudentScreen() {
  const router = useRouter();
  const invalidate = useInvalidate();
  const sections = useGet<Sections>('/sections');
  const [name, setName] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Created | null>(null);
  const ready = name.trim().length >= 2 && !!sectionId;

  async function save() {
    if (!ready) return;
    setBusy(true);
    const r = await api<Created>('/students', {
      body: {
        displayName: name.trim(),
        sectionId,
        gender: gender ?? undefined,
        guardianName: guardianName.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
      },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'Adding a student needs a connection');
    if (!r.ok) return toast('error', r.error.message);
    invalidate('/students');
    invalidate('/mobile/home');
    setDone(r.data);
  }

  if (done)
    return (
      <Screen back title="Student added">
        <Card>
          <Text style={font.title}>{done.name}</Text>
          <Text style={font.small}>
            {done.section} · Roll {done.rollNumber}
          </Text>
        </Card>
        <Card title="Their sign-in">
          <Row
            title="Username"
            right={
              <Text selectable style={{ fontWeight: '700', color: colors.ink }}>
                {done.username}
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
        <Button onPress={() => router.replace(`/(app)/students/${done.id}` as never)}>Open profile</Button>
        <Button
          variant="ghost"
          onPress={() => {
            setDone(null);
            setName('');
            setGuardianName('');
            setGuardianPhone('');
          }}
        >
          Add another
        </Button>
      </Screen>
    );

  return (
    <Screen back title="New student">
      <Field label="Full name">
        <Input value={name} onChangeText={setName} autoCapitalize="words" maxLength={120} />
      </Field>
      <Field label="Class">
        {!sections.data ? (
          <Loading />
        ) : sections.data.items.length === 0 ? (
          <Text style={font.small}>No classes this year yet. Set them up on the web.</Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sections.data.items.map((s) => {
              const full = s.capacity !== null && s.studentCount >= s.capacity;
              return (
                <Chip key={s.id} active={sectionId === s.id} onPress={() => !full && setSectionId(s.id)}>
                  {full ? `${s.label} · full` : s.label}
                </Chip>
              );
            })}
          </View>
        )}
      </Field>
      <Field label="Gender">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip active={gender === 'MALE'} onPress={() => setGender('MALE')}>
            Boy
          </Chip>
          <Chip active={gender === 'FEMALE'} onPress={() => setGender('FEMALE')}>
            Girl
          </Chip>
        </View>
      </Field>
      <Field label="Guardian name">
        <Input value={guardianName} onChangeText={setGuardianName} autoCapitalize="words" />
      </Field>
      <Field label="Guardian phone">
        <Input
          value={guardianPhone}
          onChangeText={setGuardianPhone}
          keyboardType="phone-pad"
          placeholder="03XX XXXXXXX"
        />
      </Field>
      <Button onPress={save} loading={busy} disabled={!ready}>
        Add student
      </Button>
    </Screen>
  );
}
