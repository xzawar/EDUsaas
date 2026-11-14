import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Modal, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Field, Input } from '@/components/ui';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { periodLabel, todayIso, uuid, METHOD_LABELS } from '@/lib/format';
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

export function ClaimSheet({ bills, onClose }: { bills: Bill[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [invoiceId, setInvoiceId] = useState(bills[0]?.id ?? '');
  const bill = bills.find((b) => b.id === invoiceId);
  const [amount, setAmount] = useState(bill ? toRupees(bill.balancePaisa) : '');
  const [method, setMethod] = useState('JAZZCASH');
  const [reference, setReference] = useState('');
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
    if (!proof) return toast('error', 'Add the payment screenshot.');
    setBusy(true);
    const r = await api('/me/fees/claims', {
      body: {
        invoiceId,
        amountPaisa: paisa,
        method,
        reference: reference.trim(),
        paidOn: todayIso(),
        clientKey,
        proof: proof.base64,
      },
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
        <Text style={font.h1}>Tell the school you paid</Text>
        <Text style={font.small}>
          Paid by bank, JazzCash or Easypaisa? Send the details and a screenshot. The office confirms it and you get a
          receipt.
        </Text>
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
        <Field
          label="Amount paid (PKR)"
          hint={bill ? `Balance on this bill: ${toRupees(bill.balancePaisa)}` : undefined}
        >
          <Input keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        </Field>
        <Field label="Paid by">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(METHOD_LABELS)
              .filter(([k]) => k !== 'CASH')
              .map(([k, label]) => (
                <Chip key={k} active={method === k} onPress={() => setMethod(k)}>
                  {label}
                </Chip>
              ))}
          </View>
        </Field>
        <Field label="Transaction ID">
          <Input
            value={reference}
            onChangeText={setReference}
            placeholder="From your bank / wallet app"
            autoCapitalize="characters"
          />
        </Field>
        <Field label="Screenshot of the payment">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="secondary" icon="camera-outline" style={{ flex: 1 }} onPress={() => pick(true)}>
              Camera
            </Button>
            <Button variant="secondary" icon="images-outline" style={{ flex: 1 }} onPress={() => pick(false)}>
              Gallery
            </Button>
          </View>
          {proof && (
            <Image
              source={{ uri: proof.uri }}
              style={{ height: 160, borderRadius: 12, marginTop: 8 }}
              resizeMode="cover"
            />
          )}
        </Field>
        <Button onPress={submit} loading={busy} disabled={!proof || reference.trim().length < 2}>
          Send proof
        </Button>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </ScrollView>
    </Modal>
  );
}
