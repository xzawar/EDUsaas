import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { DateStepper } from '@/components/date-stepper';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Chip, Field, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useGet } from '@/lib/data';
import { todayIso } from '@/lib/format';
import { colors, font, space } from '@/lib/theme';

type Option = { sectionId: string; section: string; subjectId: string; subject: string };

/** Create a test for a class and subject you teach, then go straight to entering marks. */
export function NewTestSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const opts = useGet<{ items: Option[] }>('/assessments/options');
  const items = opts.data?.items ?? [];
  const [pick, setPick] = useState(0);
  const chosen = items[pick];
  const [name, setName] = useState('');
  const [maxMarks, setMaxMarks] = useState('20');
  const [heldOn, setHeldOn] = useState(todayIso());
  const [chapter, setChapter] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const out = Number(maxMarks);
  const ready = !!chosen && name.trim().length >= 2 && out > 0 && out <= 1000;

  async function create() {
    if (!chosen || !ready) return;
    setBusy(true);
    const r = await api<{ assessment: { id: string } }>('/assessments', {
      body: {
        sectionId: chosen.sectionId,
        subjectId: chosen.subjectId,
        name: name.trim(),
        maxMarks: out,
        heldOn,
        chapter: chapter.trim() || undefined,
        details: details.trim() || undefined,
      },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'Creating a test needs a connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Test created');
    onCreated(r.data.assessment.id);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, paddingBottom: 40, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={onClose} />
        </View>
        <Text style={font.h1}>New test</Text>
        <Field label="Class and subject">
          {opts.isLoading ? (
            <Text style={font.small}>Loading your classes…</Text>
          ) : items.length === 0 ? (
            <Text style={font.small}>You’re not assigned to a subject yet. Ask the School Admin.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {items.map((o, i) => (
                <Chip key={`${o.sectionId}:${o.subjectId}`} active={pick === i} onPress={() => setPick(i)}>
                  {`${o.section} · ${o.subject}`}
                </Chip>
              ))}
            </View>
          )}
        </Field>
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="e.g. Quiz 3, Mid-term" maxLength={80} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: 110 }}>
            <Field label="Out of">
              <Input
                value={maxMarks}
                onChangeText={(t) => setMaxMarks(t.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Date">
              <DateStepper label="Test date" value={heldOn} onChange={setHeldOn} />
            </Field>
          </View>
        </View>
        <Field label="Chapter (optional)">
          <Input value={chapter} onChangeText={setChapter} placeholder="e.g. Chapter 4: Fractions" maxLength={120} />
        </Field>
        <Field label="Notes for students (optional)">
          <Input
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={1000}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
        </Field>
        <Button onPress={create} loading={busy} disabled={!ready}>
          Create and enter marks
        </Button>
      </ScrollView>
    </Modal>
  );
}
