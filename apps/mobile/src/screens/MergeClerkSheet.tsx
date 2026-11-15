import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Chip, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, font, space } from '@/lib/theme';

type Person = { id: string; displayName: string; role: string };

/**
 * One front-office seat instead of two: the person kept becomes a Clerk (fees + admissions); the other account is
 * switched off (not deleted, so their past receipts and admissions keep their name).
 */
export function MergeClerkSheet({
  accountants,
  admissions,
  onClose,
}: {
  accountants: Person[];
  admissions: Person[];
  onClose: (merged: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [acc, setAcc] = useState(accountants[0]?.id ?? '');
  const [adm, setAdm] = useState(admissions[0]?.id ?? '');
  const [keep, setKeep] = useState<'acc' | 'adm'>('acc');
  const [busy, setBusy] = useState(false);
  const kept = keep === 'acc' ? accountants.find((p) => p.id === acc) : admissions.find((p) => p.id === adm);
  const off = keep === 'acc' ? admissions.find((p) => p.id === adm) : accountants.find((p) => p.id === acc);

  async function merge() {
    if (!kept || !off) return;
    setBusy(true);
    const r = await api('/users/merge-clerk', { body: { keepId: kept.id, retireId: off.id } }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', `${kept.displayName} is now the Clerk`);
    onClose(true);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={() => onClose(false)} />
        </View>
        <Text style={font.h1}>One Clerk</Text>
        <Text style={font.body}>Fees and admissions in one account.</Text>
        {accountants.length > 1 && (
          <Field label="Accountant">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {accountants.map((p) => (
                <Chip key={p.id} active={acc === p.id} onPress={() => setAcc(p.id)}>
                  {p.displayName}
                </Chip>
              ))}
            </View>
          </Field>
        )}
        {admissions.length > 1 && (
          <Field label="Admissions officer">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {admissions.map((p) => (
                <Chip key={p.id} active={adm === p.id} onPress={() => setAdm(p.id)}>
                  {p.displayName}
                </Chip>
              ))}
            </View>
          </Field>
        )}
        <Field label="Who keeps their account?">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip active={keep === 'acc'} onPress={() => setKeep('acc')}>
              {accountants.find((p) => p.id === acc)?.displayName ?? 'Accountant'}
            </Chip>
            <Chip active={keep === 'adm'} onPress={() => setKeep('adm')}>
              {admissions.find((p) => p.id === adm)?.displayName ?? 'Admissions'}
            </Chip>
          </View>
        </Field>
        {kept && off && (
          <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 6 }}>
            <Text style={[font.body, { color: colors.ink }]}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{kept.displayName}</Text> becomes the Clerk.
            </Text>
            <Text style={font.body}>
              <Text style={{ fontWeight: '700', color: colors.ink }}>{off.displayName}</Text>’s account is switched off.
            </Text>
          </View>
        )}
        <Button onPress={merge} loading={busy} disabled={!kept || !off}>
          Merge into one Clerk
        </Button>
      </ScrollView>
    </Modal>
  );
}
