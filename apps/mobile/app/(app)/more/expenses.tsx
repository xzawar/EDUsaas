import { useState } from 'react';
import { Image, Modal, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Money, Row, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { shrink } from '@/screens/ClaimSheet';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate, METHOD_LABELS, todayIso, uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';
import { toPaisa } from '@edusaas/shared';

type E = {
  from: string;
  to: string;
  total: number;
  totalPaisa: number;
  items: {
    id: string;
    voucherNumber: string;
    category: string;
    amountPaisa: number;
    spentOn: string;
    paidTo: string;
    method: string;
    reversed: boolean;
    isReversal: boolean;
  }[];
};
type Cat = { items: { id: string; name: string }[] };

/** Petty cash and bills. Accountant/admin can add from the phone (with a photo of the bill), others read. */
export default function ExpensesScreen() {
  const me = useSession((s) => s.me)!;
  const q = useGet<E>('/expenses');
  const [adding, setAdding] = useState(false);
  const d = q.data;
  const canAdd = me.permissions.includes('expenses.manage');
  return (
    <Screen
      title="Expenses"
      subtitle={d ? `${fmtDate(d.from)} – ${fmtDate(d.to)}` : undefined}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {canAdd && (
        <Button icon="add" onPress={() => setAdding(true)}>
          Add expense
        </Button>
      )}
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <Card>
          <Text style={font.tiny}>Spent this month</Text>
          <Money paisa={d.totalPaisa} style={{ fontSize: 26, fontWeight: '700' }} />
        </Card>
      )}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="bag-outline"
            title="Nothing spent this month"
            body={canAdd ? 'Add petty cash, bills and purchases as they happen.' : undefined}
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((e) => (
            <Row
              key={e.id}
              title={e.paidTo}
              subtitle={`${e.voucherNumber} · ${e.category} · ${fmtDate(e.spentOn)}`}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Money paisa={e.amountPaisa} style={{ fontWeight: '600' }} />
                  {(e.reversed || e.isReversal) && <Badge tone="slate">{e.isReversal ? 'Reversal' : 'Reversed'}</Badge>}
                </View>
              }
            />
          ))}
        </Card>
      )}
      {adding && (
        <AddExpense
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            void q.refetch();
          }}
        />
      )}
    </Screen>
  );
}

function AddExpense({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me)!;
  const cats = useGet<Cat>('/expenses/categories');
  const invalidate = useInvalidate();
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientKey] = useState(uuid);
  let paisa = 0;
  try {
    paisa = amount ? toPaisa(amount) : 0;
  } catch {
    paisa = -1;
  }

  async function pick() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return toast('error', 'Allow camera access to photograph the bill.');
    const r = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    try {
      setPhoto({ uri: r.assets[0].uri, base64: await shrink(r.assets[0].uri) });
    } catch {
      toast('error', 'That photo is too large. Try again closer.');
    }
  }
  async function save() {
    if (!categoryId) return toast('error', 'Pick a category.');
    if (paisa <= 0) return toast('error', 'Enter the amount.');
    if (paidTo.trim().length < 2) return toast('error', 'Who was it paid to?');
    setBusy(true);
    const r = await sendOrQueue({
      id: uuid(),
      path: '/expenses',
      method: 'POST',
      body: {
        categoryId,
        amountPaisa: paisa,
        spentOn: todayIso(),
        paidTo: paidTo.trim(),
        method,
        note: note.trim() || undefined,
        clientKey,
        receipt: photo?.base64,
      },
      label: `Expense ${paidTo.trim()}`,
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    toast(
      'success',
      r.status === 'queued' ? 'Saved on this phone. It sends when you’re back online.' : 'Expense saved',
    );
    invalidate('/expenses');
    invalidate('/finance');
    onDone();
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={font.h1}>Add expense</Text>
        <Field label="Category">
          {!cats.data ? (
            <Loading />
          ) : cats.data.items.length === 0 ? (
            <Text style={font.small}>Add expense categories on the web first.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cats.data.items.map((c) => (
                <Chip key={c.id} active={categoryId === c.id} onPress={() => setCategoryId(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </View>
          )}
        </Field>
        <Field label="Amount (PKR)" error={paisa < 0 ? 'Enter a number like 1200' : null}>
          <Input
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            style={{ fontSize: 22, fontWeight: '600' }}
          />
        </Field>
        <Field label="Paid to">
          <Input value={paidTo} onChangeText={setPaidTo} placeholder="e.g. Ali Stationers" />
        </Field>
        <Field label="Paid by">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(METHOD_LABELS).map(([k, l]) => (
              <Chip key={k} active={method === k} onPress={() => setMethod(k)}>
                {l}
              </Chip>
            ))}
          </View>
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChangeText={setNote} />
        </Field>
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={{ width: '100%', height: 180, borderRadius: 12 }}
            resizeMode="cover"
          />
        ) : null}
        <Button variant="secondary" icon="camera-outline" onPress={pick}>
          {photo ? 'Retake bill photo' : 'Photo of the bill (optional)'}
        </Button>
        <Button onPress={save} loading={busy} icon="checkmark">
          Save expense
        </Button>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </ScrollView>
    </Modal>
  );
}
