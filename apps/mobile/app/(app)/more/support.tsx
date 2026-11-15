import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { relative } from '@/lib/format';
import { colors, font, space } from '@/lib/theme';

type Ticket = {
  id: string;
  subject: string;
  status: string;
  author: string;
  updatedAt: string;
  messages: { id: string; body: string; author: string; fromPlatform: boolean; createdAt: string }[];
};
const STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'slate' }> = {
  OPEN: { label: 'Waiting', tone: 'amber' },
  ANSWERED: { label: 'Answered', tone: 'green' },
  CLOSED: { label: 'Closed', tone: 'slate' },
};

/** Ask the EDUsaas team for help, and read their answers. Every staff seat has this; students ask their school. */
export default function SupportScreen() {
  const q = useGet<{ items: Ticket[] }>('/support/tickets');
  const invalidate = useInvalidate();
  const [writing, setWriting] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const d = q.data;
  return (
    <Screen
      back
      title="Help"
      refreshing={q.isFetching}
      onRefresh={q.refetch}
      right={
        <Button variant="secondary" icon="add" onPress={() => setWriting(true)}>
          Ask
        </Button>
      }
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty icon="help-buoy-outline" title="No questions yet" body="Tap Ask to message the EDUsaas team." />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((t) => (
            <Row
              key={t.id}
              title={t.subject}
              subtitle={relative(t.updatedAt)}
              right={<Badge tone={STATUS[t.status]?.tone ?? 'slate'}>{STATUS[t.status]?.label ?? t.status}</Badge>}
              onPress={() => setOpen(t)}
            />
          ))}
        </Card>
      )}
      {writing && (
        <Compose
          onClose={(sent) => {
            setWriting(false);
            if (sent) invalidate('/support/tickets');
          }}
        />
      )}
      {open && (
        <Thread
          t={open}
          onClose={(changed) => {
            setOpen(null);
            if (changed) invalidate('/support/tickets');
          }}
        />
      )}
    </Screen>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, paddingBottom: 40, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={onClose} />
        </View>
        {children}
      </ScrollView>
    </Modal>
  );
}

function Compose({ onClose }: { onClose: (sent: boolean) => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const r = await api('/support/tickets', { body: { subject: subject.trim(), body: body.trim() } }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Sent. We’ll reply here.');
    onClose(true);
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <Text style={font.h1}>Ask for help</Text>
      <Field label="About">
        <Input value={subject} onChangeText={setSubject} maxLength={150} placeholder="e.g. Can’t print receipts" />
      </Field>
      <Field label="What happened?">
        <Input
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={5000}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />
      </Field>
      <Button onPress={send} loading={busy} disabled={subject.trim().length < 3 || !body.trim()}>
        Send
      </Button>
    </Sheet>
  );
}

function Thread({ t, onClose }: { t: Ticket; onClose: (changed: boolean) => void }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    const r = await api(`/support/tickets/${t.id}/reply`, { body: { body: reply.trim() } }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Sent');
    onClose(true);
  }
  return (
    <Sheet onClose={() => onClose(false)}>
      <Text style={font.h1}>{t.subject}</Text>
      {t.messages.map((m) => (
        <View
          key={m.id}
          style={{
            alignSelf: m.fromPlatform ? 'flex-start' : 'flex-end',
            maxWidth: '85%',
            backgroundColor: m.fromPlatform ? colors.card : colors.brand,
            borderRadius: 16,
            padding: 12,
            gap: 4,
          }}
        >
          <Text style={[font.tiny, { color: m.fromPlatform ? colors.muted : colors.deep }]}>
            {m.fromPlatform ? 'EDUsaas' : m.author} · {relative(m.createdAt)}
          </Text>
          <Text style={[font.body, { color: m.fromPlatform ? colors.ink : colors.deep }]}>{m.body}</Text>
        </View>
      ))}
      {t.status !== 'CLOSED' && (
        <>
          <Input
            value={reply}
            onChangeText={setReply}
            multiline
            placeholder="Write a reply"
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <Button onPress={send} loading={busy} disabled={!reply.trim()}>
            Reply
          </Button>
        </>
      )}
    </Sheet>
  );
}
