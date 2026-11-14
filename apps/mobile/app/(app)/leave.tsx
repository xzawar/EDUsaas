import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate, todayIso, uuid } from '@/lib/format';
import { sendOrQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';

type Leave = {
  id: string;
  applicant: string;
  applicantRole: string;
  type: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: string;
  canCancel?: boolean;
  note?: string | null;
  section?: string | null;
};
const TONE: Record<string, 'amber' | 'green' | 'red' | 'slate'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'slate',
};

export default function LeaveScreen() {
  const me = useSession((s) => s.me)!;
  const canApprove =
    me.permissions.includes('leave.approve') || me.user.role === 'TEACHER' || me.user.role === 'SCHOOL_ADMIN';
  const canApply = me.permissions.includes('leave.apply');
  const [tab, setTab] = useState<'mine' | 'approve'>(canApprove && me.user.role !== 'STUDENT' ? 'approve' : 'mine');
  const mine = useGet<{ items: Leave[] }>(canApply ? '/leave' : null);
  const queue = useGet<{ items: Leave[] }>(canApprove ? '/leave/approvals' : null);
  const invalidate = useInvalidate();
  const [applying, setApplying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const active = tab === 'mine' ? mine : queue;

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusyId(id);
    const r = await api(`/leave/${id}/decision`, { body: { decision } }).catch(() => null);
    setBusyId(null);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', decision === 'APPROVED' ? 'Approved' : 'Declined');
    invalidate('/leave');
    invalidate('/mobile/home');
  }

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
            To approve{queue.data?.items.length ? ` (${queue.data.items.length})` : ''}
          </Chip>
          <Chip active={tab === 'mine'} onPress={() => setTab('mine')}>
            My leave
          </Chip>
        </View>
      )}
      {active.isError && !active.data && <ErrorBox message={errorText(active.error)} onRetry={active.refetch} />}
      {!active.data && active.isLoading && <Loading />}
      {active.data && active.data.items.length === 0 && (
        <Card>
          <Empty
            icon="airplane-outline"
            title={tab === 'mine' ? 'No leave requests yet' : 'Nothing waiting for you'}
            body={
              tab === 'mine'
                ? 'Tap Apply to ask for days off.'
                : 'New requests from your students or staff appear here.'
            }
          />
        </Card>
      )}
      {active.data && active.data.items.length > 0 && (
        <Card>
          {active.data.items.map((l) => (
            <View
              key={l.id}
              style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 6 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '600', color: colors.ink }}>
                  {tab === 'mine' ? l.type : `${l.applicant}${l.section ? ` · ${l.section}` : ''}`}
                </Text>
                <Badge tone={TONE[l.status] ?? 'slate'}>{l.status.charAt(0) + l.status.slice(1).toLowerCase()}</Badge>
              </View>
              <Text style={font.small}>
                {tab === 'mine' ? '' : `${l.type} · `}
                {fmtDate(l.fromDate)}
                {l.toDate !== l.fromDate ? ` – ${fmtDate(l.toDate)}` : ''} ({l.days} day{l.days === 1 ? '' : 's'})
              </Text>
              <Text style={font.body}>{l.reason}</Text>
              {tab === 'approve' && l.status === 'PENDING' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Button
                    variant="secondary"
                    style={{ flex: 1 }}
                    loading={busyId === l.id}
                    onPress={() => decide(l.id, 'REJECTED')}
                  >
                    Decline
                  </Button>
                  <Button style={{ flex: 1 }} loading={busyId === l.id} onPress={() => decide(l.id, 'APPROVED')}>
                    Approve
                  </Button>
                </View>
              )}
            </View>
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
      body: { typeId: chosen, fromDate: from, toDate: to, reason: reason.trim() },
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
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="From (YYYY-MM-DD)">
              <Input value={from} onChangeText={setFrom} keyboardType="numbers-and-punctuation" />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To">
              <Input value={to} onChangeText={setTo} keyboardType="numbers-and-punctuation" />
            </Field>
          </View>
        </View>
        <Field label="Reason">
          <Input
            value={reason}
            onChangeText={setReason}
            multiline
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </Field>
        <Button
          onPress={submit}
          loading={busy}
          disabled={reason.trim().length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)}
        >
          Send request
        </Button>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </ScrollView>
    </Modal>
  );
}
