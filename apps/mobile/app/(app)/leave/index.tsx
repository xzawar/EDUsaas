import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { DateStepper } from '@/components/date-stepper';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate, todayIso, uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';

export type Leave = {
  id: string;
  applicant: string;
  applicantRole: string;
  type: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: string;
  decisionNote?: string | null;
  section?: string | null;
};
export const LEAVE_TONE: Record<string, 'amber' | 'green' | 'red' | 'slate'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'slate',
};
export const leaveStatus = (s: string) => (s === 'REJECTED' ? 'Declined' : s.charAt(0) + s.slice(1).toLowerCase());
export const leaveDates = (l: Leave) =>
  `${fmtDate(l.fromDate, { day: 'numeric', month: 'short' })}${
    l.toDate !== l.fromDate ? ` – ${fmtDate(l.toDate, { day: 'numeric', month: 'short' })}` : ''
  } · ${l.days} day${l.days === 1 ? '' : 's'}`;

/** Leave: a short list (who or what, dates, status). The reason, notes and decisions are one tap away. */
export default function LeaveScreen() {
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const canApprove =
    me.permissions.includes('leave.approve') || me.user.role === 'TEACHER' || me.user.role === 'SCHOOL_ADMIN';
  const canApply = me.permissions.includes('leave.apply');
  const [tab, setTab] = useState<'mine' | 'approve'>(canApprove && me.user.role !== 'STUDENT' ? 'approve' : 'mine');
  const mine = useGet<{ items: Leave[] }>(canApply ? '/leave' : null);
  const queue = useGet<{ items: Leave[] }>(canApprove ? '/leave/approvals' : null);
  const invalidate = useInvalidate();
  const [applying, setApplying] = useState(false);
  const active = tab === 'mine' ? mine : queue;
  const waiting = queue.data?.items.filter((l) => l.status === 'PENDING').length ?? 0;

  return (
    <Screen
      title="Leave"
      refreshing={active.isFetching}
      onRefresh={() => {
        void mine.refetch();
        void queue.refetch();
      }}
      right={
        canApply ? (
          <Button variant="secondary" icon="add" onPress={() => setApplying(true)}>
            Apply
          </Button>
        ) : undefined
      }
    >
      {canApply && canApprove && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip active={tab === 'approve'} onPress={() => setTab('approve')}>
            To decide{waiting ? ` · ${waiting}` : ''}
          </Chip>
          <Chip active={tab === 'mine'} onPress={() => setTab('mine')}>
            Mine
          </Chip>
        </View>
      )}
      {active.isError && !active.data && <ErrorBox message={errorText(active.error)} onRetry={active.refetch} />}
      {!active.data && active.isLoading && <Loading />}
      {active.data && active.data.items.length === 0 && (
        <Card>
          <Empty
            icon="airplane-outline"
            title={tab === 'mine' ? 'No leave yet' : 'Nothing to decide'}
            body={tab === 'mine' ? 'Tap Apply to ask for days off.' : 'New requests appear here.'}
          />
        </Card>
      )}
      {active.data && active.data.items.length > 0 && (
        <Card>
          {active.data.items.map((l) => (
            <Row
              key={l.id}
              title={tab === 'mine' ? l.type : `${l.applicant}${l.section ? ` · ${l.section}` : ''}`}
              subtitle={leaveDates(l)}
              right={<Badge tone={LEAVE_TONE[l.status] ?? 'slate'}>{leaveStatus(l.status)}</Badge>}
              onPress={() => router.push({ pathname: '/(app)/leave/[id]', params: { id: l.id, from: tab } } as never)}
            />
          ))}
        </Card>
      )}
      {applying && (
        <ApplySheet
          onClose={() => {
            setApplying(false);
            invalidate('/leave');
          }}
        />
      )}
    </Screen>
  );
}

function ApplySheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const me = useSession((s) => s.me)!;
  const types = useGet<{ items: { id: string; name: string }[] }>('/leave/types');
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = typeId || types.data?.items[0]?.id || '';
  async function submit() {
    if (!chosen) return;
    setBusy(true);
    const r = await sendOrQueue({
      id: uuid(),
      path: '/leave',
      method: 'POST',
      body: { typeId: chosen, fromDate: from, toDate: to < from ? from : to, reason: reason.trim() },
      label: `Leave ${from}`,
      userId: me.user.id,
    });
    setBusy(false);
    if (r.status === 'rejected') return toast('error', r.message);
    toast(
      r.status === 'queued' ? 'info' : 'success',
      r.status === 'queued' ? 'Saved. It will send when you’re online.' : 'Request sent',
    );
    onClose();
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={onClose} />
        </View>
        <Text style={font.h1}>Apply for leave</Text>
        <Field label="Type">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {types.data?.items.map((t) => (
              <Chip key={t.id} active={chosen === t.id} onPress={() => setTypeId(t.id)}>
                {t.name}
              </Chip>
            ))}
          </View>
        </Field>
        <Field label="From">
          <DateStepper
            label="From"
            value={from}
            onChange={(v) => {
              setFrom(v);
              if (to < v) setTo(v);
            }}
          />
        </Field>
        <Field label="To">
          <DateStepper label="To" value={to < from ? from : to} min={from} onChange={setTo} />
        </Field>
        <Field label="Reason">
          <Input
            value={reason}
            onChangeText={setReason}
            multiline
            placeholder="A short note for whoever approves it"
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </Field>
        <Button onPress={submit} loading={busy} disabled={reason.trim().length < 3 || !chosen}>
          Send request
        </Button>
      </ScrollView>
    </Modal>
  );
}
