import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Empty, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useGet, useInvalidate } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { colors, font } from '@/lib/theme';
import { LEAVE_TONE, leaveStatus, type Leave } from './index';

/** One leave request in full. The person deciding can add a note that the applicant will see. */
export default function LeaveDetail() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const deciding = from === 'approve';
  // Read from the list the user came from (already cached), so the page opens instantly.
  const q = useGet<{ items: Leave[] }>(deciding ? '/leave/approvals' : '/leave');
  const l = q.data?.items.find((x) => x.id === id);
  const invalidate = useInvalidate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function act(path: string, body: object | undefined, done: string, key: string) {
    setBusy(key);
    const r = await api(path, { body: body ?? {} }).catch(() => null);
    setBusy(null);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', done);
    invalidate('/leave');
    invalidate('/mobile/home');
    router.back();
  }

  return (
    <Screen
      back
      title={l ? (deciding ? l.applicant : l.type) : 'Leave'}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {!q.data && q.isLoading && <Loading />}
      {q.data && !l && <Empty icon="airplane-outline" title="Request not found" />}
      {l && (
        <>
          <View style={{ flexDirection: 'row' }}>
            <Badge tone={LEAVE_TONE[l.status] ?? 'slate'}>{leaveStatus(l.status)}</Badge>
          </View>
          <Card>
            {deciding && <Row title="Type" right={l.type} />}
            {l.section ? <Row title="Class" right={l.section} /> : null}
            <Row title="From" right={fmtDate(l.fromDate, { weekday: 'short', day: 'numeric', month: 'short' })} />
            <Row title="To" right={fmtDate(l.toDate, { weekday: 'short', day: 'numeric', month: 'short' })} />
            <Row title="Days" right={String(l.days)} />
          </Card>
          <Card title="Reason">
            <Text style={font.body}>{l.reason}</Text>
          </Card>
          {l.decisionNote ? (
            <Card title="Note">
              <Text style={[font.body, { color: colors.ink }]}>{l.decisionNote}</Text>
            </Card>
          ) : null}
          {deciding && l.status === 'PENDING' && (
            <>
              <Field label="Note (optional)">
                <Input
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={300}
                  placeholder="They will see this with your answer"
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
              </Field>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  variant="secondary"
                  style={{ flex: 1 }}
                  loading={busy === 'no'}
                  onPress={() =>
                    act(
                      `/leave/${l.id}/decision`,
                      { decision: 'REJECTED', note: note.trim() || undefined },
                      'Declined',
                      'no',
                    )
                  }
                >
                  Decline
                </Button>
                <Button
                  style={{ flex: 1 }}
                  loading={busy === 'yes'}
                  onPress={() =>
                    act(
                      `/leave/${l.id}/decision`,
                      { decision: 'APPROVED', note: note.trim() || undefined },
                      'Approved',
                      'yes',
                    )
                  }
                >
                  Approve
                </Button>
              </View>
            </>
          )}
          {!deciding && l.status === 'PENDING' && (
            <Button
              variant="ghost"
              loading={busy === 'cancel'}
              onPress={() => act(`/leave/${l.id}/cancel`, undefined, 'Cancelled', 'cancel')}
            >
              Cancel this request
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
