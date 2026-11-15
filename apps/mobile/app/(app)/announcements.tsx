import { useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Empty, ErrorBox, Field, Input, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/lib/theme';

type A = {
  id: string;
  title: string;
  body: string;
  audienceLabel: string;
  pinned: boolean;
  createdAt: string;
  author: string;
  expired: boolean;
};

/** Notices. The office posts to everyone, staff, students or one class; a teacher posts to their own classes. */
export default function AnnouncementsScreen() {
  const me = useSession((s) => s.me)!;
  const office = me.permissions.includes('announcements.manage');
  const teacher = me.permissions.includes('announcements.class');
  const q = useGet<{ items: A[] }>('/announcements');
  const invalidate = useInvalidate();
  const [writing, setWriting] = useState(false);
  const d = q.data;
  const live = d?.items.filter((a) => !a.expired) ?? [];
  return (
    <Screen
      title="Notices"
      refreshing={q.isFetching}
      onRefresh={q.refetch}
      right={
        office || teacher ? (
          <Button variant="secondary" icon="add" onPress={() => setWriting(true)}>
            New
          </Button>
        ) : undefined
      }
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && live.length === 0 && (
        <Card>
          <Empty
            icon="megaphone-outline"
            title="Nothing posted yet"
            body={office || teacher ? 'Tap New to post a notice.' : undefined}
          />
        </Card>
      )}
      {live.map((a) => (
        <Card key={a.id}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{a.title}</Text>
          <Text style={font.body}>{a.body}</Text>
          <Text style={font.tiny}>
            {a.pinned ? 'Pinned · ' : ''}
            {fmtDate(a.createdAt)} · {a.author} · {a.audienceLabel}
          </Text>
        </Card>
      ))}
      {writing && (
        <Compose
          office={office}
          onClose={(sent) => {
            setWriting(false);
            if (sent) {
              invalidate('/announcements');
              invalidate('/mobile/home');
            }
          }}
        />
      )}
    </Screen>
  );
}

type Audience = 'EVERYONE' | 'STAFF' | 'STUDENTS' | 'SECTION';

function Compose({ office, onClose }: { office: boolean; onClose: (sent: boolean) => void }) {
  const insets = useSafeAreaInsets();
  // Office: every class this year. Teacher: their own classes (from the home payload).
  const sections = useGet<{ items: { id: string; label: string }[] }>(office ? '/sections' : null);
  const home = useGet<{ overview?: { sections: { id: string; label: string }[] } | null }>(
    office ? null : '/mobile/home',
  );
  const classes = office ? (sections.data?.items ?? []) : (home.data?.overview?.sections ?? []);
  const [audience, setAudience] = useState<Audience>(office ? 'EVERYONE' : 'SECTION');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const chosenSection = sectionId ?? (audience === 'SECTION' ? (classes[0]?.id ?? null) : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = title.trim().length >= 3 && body.trim().length > 0 && (audience !== 'SECTION' || !!chosenSection);

  async function send() {
    setBusy(true);
    const r = await api('/announcements', {
      body: {
        title: title.trim(),
        body: body.trim(),
        audience,
        sectionId: audience === 'SECTION' ? chosenSection : null,
        pinned,
      },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', 'Posted. Everyone in it gets a notification.');
    onClose(true);
  }

  const AUD: { k: Audience; label: string }[] = office
    ? [
        { k: 'EVERYONE', label: 'Everyone' },
        { k: 'STAFF', label: 'Staff' },
        { k: 'STUDENTS', label: 'Students' },
        { k: 'SECTION', label: 'One class' },
      ]
    : [];

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, paddingBottom: 40, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={() => onClose(false)} />
        </View>
        <Text style={font.h1}>New notice</Text>
        {office && (
          <Field label="Who sees it">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {AUD.map((a) => (
                <Chip key={a.k} active={audience === a.k} onPress={() => setAudience(a.k)}>
                  {a.label}
                </Chip>
              ))}
            </View>
          </Field>
        )}
        {audience === 'SECTION' && (
          <Field label={office ? 'Class' : 'Your class'}>
            {classes.length === 0 ? (
              <Text style={font.small}>No classes found.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {classes.map((c) => (
                  <Chip key={c.id} active={chosenSection === c.id} onPress={() => setSectionId(c.id)}>
                    {c.label}
                  </Chip>
                ))}
              </View>
            )}
          </Field>
        )}
        <Field label="Title">
          <Input value={title} onChangeText={setTitle} maxLength={120} placeholder="e.g. Sports day on Friday" />
        </Field>
        <Field label="Message">
          <Input
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={4000}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
        </Field>
        {office && (
          <View style={{ flexDirection: 'row' }}>
            <Chip active={pinned} onPress={() => setPinned(!pinned)}>
              {pinned ? '✓ Pinned to the top' : 'Pin to the top'}
            </Chip>
          </View>
        )}
        <Button onPress={send} loading={busy} disabled={!ready} icon="paper-plane-outline">
          Post notice
        </Button>
      </ScrollView>
    </Modal>
  );
}
