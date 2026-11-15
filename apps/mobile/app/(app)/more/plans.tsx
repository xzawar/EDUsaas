import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { colors, font, space } from '@/lib/theme';

type Plan = {
  id: string;
  name: string;
  priceMonthly: number;
  maxStudents: number | null;
  maxStaff: number | null;
  active: boolean;
  schools: number;
};

/** The packages schools can be on. Limits are enforced: a school can't add students or staff past its plan. */
export default function PlansScreen() {
  const q = useGet<{ items: Plan[] }>('/platform/plans');
  const invalidate = useInvalidate();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const d = q.data;
  return (
    <Screen
      back
      title="Plans"
      refreshing={q.isFetching}
      onRefresh={q.refetch}
      right={
        <Button variant="secondary" icon="add" onPress={() => setEditing('new')}>
          Add
        </Button>
      }
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <Card>
          {d.items.length === 0 ? (
            <Empty icon="pricetags-outline" title="No plans yet" body="Tap Add to make the first one." />
          ) : (
            d.items.map((p) => (
              <Row
                key={p.id}
                title={p.name}
                subtitle={`${p.maxStudents ?? 'Unlimited'} students · ${p.maxStaff ?? 'unlimited'} staff · ${p.schools} school${p.schools === 1 ? '' : 's'}`}
                right={
                  !p.active ? (
                    <Badge>Retired</Badge>
                  ) : (
                    <Text style={{ fontWeight: '700', color: colors.ink }}>
                      {p.priceMonthly ? `Rs ${p.priceMonthly.toLocaleString('en-PK')}` : 'Free'}
                    </Text>
                  )
                }
                onPress={() => setEditing(p)}
              />
            ))
          )}
        </Card>
      )}
      {editing && (
        <PlanSheet
          plan={editing === 'new' ? null : editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) invalidate('/platform/plans');
          }}
        />
      )}
    </Screen>
  );
}

function PlanSheet({ plan, onClose }: { plan: Plan | null; onClose: (saved: boolean) => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(plan ? String(plan.priceMonthly) : '');
  const [students, setStudents] = useState(plan?.maxStudents ? String(plan.maxStudents) : '');
  const [staff, setStaff] = useState(plan?.maxStaff ? String(plan.maxStaff) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() ? Number(v) : null);
  const ready = name.trim().length >= 2 && price.trim() !== '' && !isNaN(Number(price));
  async function save() {
    setBusy(true);
    const body = {
      name: name.trim(),
      priceMonthly: Math.round(Number(price)),
      maxStudents: num(students),
      maxStaff: num(staff),
      active,
    };
    const r = await api(plan ? `/platform/plans/${plan.id}` : '/platform/plans', {
      method: plan ? 'PUT' : 'POST',
      body,
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', plan ? 'Plan saved' : 'Plan added');
    onClose(true);
  }
  const digits = (set: (v: string) => void) => (t: string) => set(t.replace(/[^0-9]/g, ''));
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
        <Text style={font.h1}>{plan ? 'Edit plan' : 'New plan'}</Text>
        <Field label="Name">
          <Input value={name} onChangeText={setName} placeholder="e.g. Standard" />
        </Field>
        <Field label="Price per month (Rs)">
          <Input value={price} onChangeText={digits(setPrice)} keyboardType="number-pad" placeholder="0 for free" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="Max students" hint="Empty = no limit">
              <Input value={students} onChangeText={digits(setStudents)} keyboardType="number-pad" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Max staff" hint="Empty = no limit">
              <Input value={staff} onChangeText={digits(setStaff)} keyboardType="number-pad" />
            </Field>
          </View>
        </View>
        {plan && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip active={active} onPress={() => setActive(true)}>
              On sale
            </Chip>
            <Chip active={!active} onPress={() => setActive(false)}>
              Retired
            </Chip>
          </View>
        )}
        <Button onPress={save} loading={busy} disabled={!ready}>
          Save
        </Button>
      </ScrollView>
    </Modal>
  );
}
