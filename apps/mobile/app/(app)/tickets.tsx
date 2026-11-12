import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { relative } from '@/lib/format';
import { colors, font, space } from '@/lib/theme';

type T = {
  id: string;
  subject: string;
  status: string;
  school: { name: string };
  author: string;
  messages: number;
  updatedAt: string;
};
type Detail = {
  ticket: {
    id: string;
    subject: string;
    status: string;
    school: { name: string };
    messages: { id: string; body: string; author: string; fromPlatform: boolean; createdAt: string }[];
  };
};

export default function TicketsScreen() {
  const [status, setStatus] = useState<'OPEN' | 'ANSWERED' | 'CLOSED'>('OPEN');
  const q = useGet<{ items: T[] }>(`/platform/tickets?status=${status}`);
  const [open, setOpen] = useState<T | null>(null);
  const d = q.data;
  return (
    <Screen title="Support" subtitle="Questions from schools." refreshing={q.isFetching} onRefresh={q.refetch}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['OPEN', 'ANSWERED', 'CLOSED'] as const).map((s) => (
          <Chip key={s} active={status === s} onPress={() => setStatus(s)}>
            {s === 'OPEN' ? 'Open' : s === 'ANSWERED' ? 'Answered' : 'Closed'}
          </Chip>
        ))}
      </View>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty icon="help-buoy-outline" title="Nothing here" />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((t) => (
            <Row
              key={t.id}
              title={t.subject}
              subtitle={`${t.school.name} · ${t.author} · ${relative(t.updatedAt)}`}
              right={
                <Badge tone={t.status === 'OPEN' ? 'amber' : t.status === 'ANSWERED' ? 'blue' : 'slate'}>
                  {t.messages}
                </Badge>
              }
              onPress={() => setOpen(t)}
            />
          ))}
        </Card>
      )}
      {open && (
        <TicketSheet
          id={open.id}
          onClose={() => {
            setOpen(null);
            void q.refetch();
          }}
        />
      )}
    </Screen>
  );
}

function TicketSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const q = useGet<Detail>(`/platform/tickets/${id}`);
  const invalidate = useInvalidate();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const t = q.data?.ticket;
  async function send(close: boolean) {
    setBusy(true);
    const r = await api(`/platform/tickets/${id}/reply`, { body: { body: body.trim(), close } }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    setBody('');
    toast('success', 'Reply sent');
    invalidate('/platform/tickets');
    void q.refetch();
  }
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        {!t && <Loading />}
        {t && (
          <>
            <Text style={font.h1}>{t.subject}</Text>
            <Text style={font.small}>{t.school.name}</Text>
            {t.messages.map((m) => (
              <View
                key={m.id}
                style={{
                  backgroundColor: m.fromPlatform ? colors.accentSoft : colors.card,
                  borderRadius: 16,
                  padding: 14,
                  gap: 4,
                }}
              >
                <Text style={font.tiny}>
                  {m.author} · {relative(m.createdAt)}
                </Text>
                <Text style={font.body}>{m.body}</Text>
              </View>
            ))}
            {t.status !== 'CLOSED' && (
              <>
                <Field label="Reply">
                  <Input
                    value={body}
                    onChangeText={setBody}
                    multiline
                    style={{ minHeight: 90, textAlignVertical: 'top' }}
                  />
                </Field>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    style={{ flex: 1 }}
                    onPress={() => send(false)}
                    loading={busy}
                    disabled={body.trim().length < 2}
                  >
                    Send
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ flex: 1 }}
                    onPress={() => send(true)}
                    loading={busy}
                    disabled={body.trim().length < 2}
                  >
                    Send & close
                  </Button>
                </View>
              </>
            )}
          </>
        )}
        <Button variant="ghost" onPress={onClose}>
          Close
        </Button>
      </ScrollView>
    </Modal>
  );
}
