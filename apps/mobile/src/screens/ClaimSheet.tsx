import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Field, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { periodLabel, todayIso, uuid } from '@/lib/format';
import { BackChip } from '@/components/header';
import { colors, font, space } from '@/lib/theme';
import { toPaisa, toRupees } from '@edusaas/shared';

type Bill = { id: string; number: string; period: string; balancePaisa: number };

/** Shrinks the chosen image until it fits the server's 300 KB limit and returns base64. */
export async function shrink(uri: string): Promise<string> {
  for (const [width, q] of [
    [1280, 0.7],
    [1024, 0.6],
    [800, 0.5],
    [640, 0.4],
  ] as const) {
    const r = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
      compress: q,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    if (r.base64 && (r.base64.length * 3) / 4 <= 300 * 1024) return r.base64;
  }
  throw new Error('too large');
}

export type PayAccount = {
  id: string;
  method: 'BANK' | 'JAZZCASH' | 'EASYPAISA';
  label: string;
  accountTitle: string;
  accountNumber: string;
  iban: string | null;
};
const METHOD_NAME: Record<PayAccount['method'], string> = {
  BANK: 'Bank',
  JAZZCASH: 'JazzCash',
  EASYPAISA: 'Easypaisa',
};

/** The school's account for the chosen method. Long-press any line to copy it. */
function AccountCard({ a }: { a: PayAccount }) {
  const line = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={font.small}>{label}</Text>
      <Text selectable style={{ fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 }}>
      <Text style={font.h2}>{a.label}</Text>
      {line('Account title', a.accountTitle)}
      {line(a.method === 'BANK' ? 'Account number' : 'Number', a.accountNumber)}
      {a.iban ? line('IBAN', a.iban) : null}
    </View>
  );
}

export function ClaimSheet({
  bills,
  accounts,
  onClose,
}: {
  bills: Bill[];
  accounts: PayAccount[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [invoiceId, setInvoiceId] = useState(bills[0]?.id ?? '');
  const bill = bills.find((b) => b.id === invoiceId);
  const [amount, setAmount] = useState(bill ? toRupees(bill.balancePaisa) : '');
  // Only the channels the school has set up; picking one shows where to send the money.
  const methods = (['BANK', 'JAZZCASH', 'EASYPAISA'] as const).filter((m) => accounts.some((a) => a.method === m));
  const [method, setMethod] = useState<PayAccount['method'] | null>(methods[0] ?? null);
  const shown = accounts.filter((a) => a.method === method);
  const [proof, setProof] = useState<{ base64: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientKey] = useState(uuid);

  async function pick(camera: boolean) {
    const perm = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast('error', 'Permission needed to add the screenshot.');
    const r = camera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    try {
      setProof({ base64: await shrink(r.assets[0].uri), uri: r.assets[0].uri });
    } catch {
      toast('error', 'Could not read that image.');
    }
  }
  async function submit() {
    let paisa: number;
    try {
      paisa = toPaisa(amount);
    } catch {
      return toast('error', 'Enter the amount you paid.');
    }
    if (!proof || !method) return toast('error', 'Add the payment screenshot.');
    setBusy(true);
    const r = await api('/me/fees/claims', {
      body: { invoiceId, amountPaisa: paisa, method, paidOn: todayIso(), clientKey, proof: proof.base64 },
      timeoutMs: 60_000,
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection. Try again when you’re online.');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Sent. The school office will check it.');
    onClose();
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{
          padding: space.xl,
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
          gap: space.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={onClose} />
        </View>
        <Text style={font.h1}>I have paid</Text>
        {bills.length > 1 && (
          <Field label="Which bill">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {bills.map((b) => (
                <Chip
                  key={b.id}
                  active={b.id === invoiceId}
                  onPress={() => {
                    setInvoiceId(b.id);
                    setAmount(toRupees(b.balancePaisa));
                  }}
                >
                  {periodLabel(b.period)}
                </Chip>
              ))}
            </View>
          </Field>
        )}
        <Field label="Amount (PKR)">
          <Input keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </Field>
        <Field label="Paid by">
          {methods.length === 0 ? (
            <Text style={font.small}>Your school hasn’t added its accounts yet. Pay at the office.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {methods.map((m) => (
                <Chip key={m} active={method === m} onPress={() => setMethod(m)}>
                  {METHOD_NAME[m]}
                </Chip>
              ))}
            </View>
          )}
        </Field>
        {shown.map((a) => (
          <AccountCard key={a.id} a={a} />
        ))}
        {methods.length > 0 && (
          <Field label="Screenshot">
            {proof ? (
              <Pressable onPress={() => pick(false)} accessibilityLabel="Change screenshot">
                <Image source={{ uri: proof.uri }} style={{ height: 200, borderRadius: 16 }} resizeMode="cover" />
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button variant="secondary" icon="images-outline" style={{ flex: 1 }} onPress={() => pick(false)}>
                  Gallery
                </Button>
                <Button variant="secondary" icon="camera-outline" style={{ flex: 1 }} onPress={() => pick(true)}>
                  Camera
                </Button>
              </View>
            )}
          </Field>
        )}
        <Button onPress={submit} loading={busy} disabled={!proof || !method}>
          Send
        </Button>
      </ScrollView>
    </Modal>
  );
}
