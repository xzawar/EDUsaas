import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { colors, font } from '@/lib/theme';
import { toPaisa, toRupees } from '@edusaas/shared';

type Years = { items: { id: string; name: string; status: string }[] };
type Structure = {
  year: { id: string; name: string };
  classes: { id: string; name: string }[];
  heads: { id: string; name: string; kind: 'MONTHLY' | 'TERM' | 'ONCE' }[];
  amounts: Record<string, Record<string, number>>;
};
const KIND: Record<string, string> = { MONTHLY: 'every month', TERM: 'each term', ONCE: 'one time' };

/**
 * Set fees on the phone: pick a class, type what it pays for each fee (tuition, transport…). An empty box means that
 * class doesn't pay it. Bills already issued don't change.
 */
export default function FeeSetupScreen() {
  const years = useGet<Years>('/academic-years');
  const year = years.data?.items.find((y) => y.status === 'CURRENT') ?? years.data?.items[0];
  const q = useGet<Structure>(year ? `/fees/structures?yearId=${year.id}` : null);
  const invalidate = useInvalidate();
  const d = q.data;
  const [classId, setClassId] = useState<string | null>(null);
  const cls = classId ?? d?.classes[0]?.id ?? null;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [newHead, setNewHead] = useState('');

  // Load the chosen class's amounts into the boxes.
  useEffect(() => {
    if (!d || !cls) return;
    const a = d.amounts[cls] ?? {};
    setDraft(Object.fromEntries(d.heads.map((h) => [h.id, a[h.id] ? toRupees(a[h.id]!) : ''])));
  }, [d, cls]);

  async function save() {
    if (!d || !cls || !year) return;
    let rows: { classId: string; feeHeadId: string; amountPaisa: number }[];
    try {
      rows = d.heads.map((h) => ({
        classId: cls,
        feeHeadId: h.id,
        amountPaisa: draft[h.id]?.trim() ? toPaisa(draft[h.id]!) : 0,
      }));
    } catch {
      return toast('error', 'Use numbers like 4500');
    }
    setBusy(true);
    const r = await api(`/fees/structures?yearId=${year.id}`, { method: 'PUT', body: { rows } }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Fees saved');
    invalidate('/fees');
  }
  async function addHead() {
    const r = await api('/fees/heads', { body: { name: newHead.trim(), kind: 'MONTHLY' } }).catch(() => null);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    setNewHead('');
    void q.refetch();
  }

  const total = d
    ? d.heads
        .filter((h) => h.kind === 'MONTHLY')
        .reduce((n, h) => {
          try {
            return n + (draft[h.id]?.trim() ? toPaisa(draft[h.id]!) : 0);
          } catch {
            return n;
          }
        }, 0)
    : 0;

  return (
    <Screen back title="Set fees" subtitle={year?.name} refreshing={q.isFetching} onRefresh={q.refetch}>
      {(years.isError || q.isError) && <ErrorBox message={errorText(years.error ?? q.error)} onRetry={q.refetch} />}
      {(!years.data || (year && !d)) && <Loading />}
      {years.data && !year && (
        <Card>
          <Empty
            icon="calendar-outline"
            title="No school year yet"
            body="Create the year and classes on the web first."
          />
        </Card>
      )}
      {d && d.classes.length === 0 && (
        <Card>
          <Empty icon="school-outline" title="No classes this year" />
        </Card>
      )}
      {d && d.classes.length > 0 && (
        <>
          <Field label="Class">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {d.classes.map((c) => (
                <Chip key={c.id} active={cls === c.id} onPress={() => setClassId(c.id)}>
                  {`Class ${c.name}`}
                </Chip>
              ))}
            </View>
          </Field>
          <Card title="Fees (Rs)">
            {d.heads.length === 0 && <Text style={font.small}>Add your first fee below, e.g. Tuition.</Text>}
            {d.heads.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{h.name}</Text>
                  <Text style={font.tiny}>{KIND[h.kind]}</Text>
                </View>
                <Input
                  value={draft[h.id] ?? ''}
                  onChangeText={(t) => setDraft((m) => ({ ...m, [h.id]: t.replace(/[^0-9.]/g, '') }))}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  accessibilityLabel={`${h.name} amount`}
                  style={{ width: 120, textAlign: 'right', fontWeight: '700', fontSize: 17 }}
                />
              </View>
            ))}
            {total > 0 && (
              <Text style={[font.small, { marginTop: 4 }]}>
                Monthly bill for this class:{' '}
                <Text style={{ fontWeight: '700', color: colors.ink }}>Rs {toRupees(total)}</Text>
              </Text>
            )}
          </Card>
          <Button onPress={save} loading={busy} disabled={d.heads.length === 0}>
            Save fees
          </Button>
          <Card title="Add a fee">
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Input value={newHead} onChangeText={setNewHead} placeholder="e.g. Transport" />
              </View>
              <Button variant="secondary" onPress={addHead} disabled={newHead.trim().length < 2}>
                Add
              </Button>
            </View>
            <Text style={font.tiny}>Charged every month. Term and one-time fees are set on the web.</Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
