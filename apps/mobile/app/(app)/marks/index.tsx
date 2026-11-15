import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { useState } from 'react';
import { NewTestSheet } from '@/screens/NewTestSheet';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';
import { openPdf } from '@/lib/files';

export type Result = {
  id: string;
  subject: string;
  name: string;
  heldOn: string;
  chapter: string | null;
  details: string | null;
  score: number | null;
  absent: boolean;
  maxMarks: number;
  pct: number | null;
  grade: string | null;
};
export type Results = { items: Result[]; subjects: { subject: string; pct: number | null; grade: string | null }[] };
type Tests = {
  items: {
    id: string;
    name: string;
    section: string;
    subject: string;
    maxMarks: number;
    heldOn: string;
    status: string;
    marksEntered: number;
  }[];
};
const TONE: Record<string, 'slate' | 'amber' | 'blue' | 'green'> = {
  DRAFT: 'slate',
  SUBMITTED: 'blue',
  PUBLISHED: 'green',
};
const LABEL: Record<string, string> = { DRAFT: 'Draft', SUBMITTED: 'To publish', PUBLISHED: 'Published' };

export default function MarksScreen() {
  const me = useSession((s) => s.me)!;
  return me.user.role === 'STUDENT' ? <MyMarks /> : <Tests />;
}

const scoreText = (m: Result) => (m.absent ? 'A' : `${m.score ?? '—'}/${m.maxMarks}`);

/** Student: the two newest tests up top, then every test as subject · date · marks. Tap one for its details. */
function MyMarks() {
  const q = useGet<Results>('/results/me');
  const router = useRouter();
  const d = q.data;
  const open = (id: string) => router.push(`/(app)/marks/result/${id}` as never);
  const latest = d?.items.slice(0, 2) ?? [];
  return (
    <Screen
      title="Marks"
      subtitle="This year’s results."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
      right={
        <Button
          variant="secondary"
          icon="document-text-outline"
          onPress={() => openPdf('/report-card/me', 'report-card.pdf')}
        >
          PDF
        </Button>
      }
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {latest.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {latest.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => open(m.id)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: pressed ? colors.cardStrong : colors.card,
                borderRadius: 16,
                padding: 16,
                gap: 4,
              })}
            >
              <Text style={font.tiny}>Latest · {fmtDate(m.heldOn, { day: 'numeric', month: 'short' })}</Text>
              <Text style={[font.h2]} numberOfLines={1}>
                {m.subject}
              </Text>
              <Text style={font.number}>{scoreText(m)}</Text>
              {m.grade ? (
                <Text style={[font.small, { color: colors.deep, fontWeight: '700' }]}>Grade {m.grade}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      <Card title="All tests">
        {d && d.items.length === 0 && (
          <Empty
            icon="ribbon-outline"
            title="No marks yet"
            body="Marks show here once your teacher publishes a test."
          />
        )}
        {d?.items.map((m) => (
          <Row
            key={m.id}
            title={m.subject}
            subtitle={fmtDate(m.heldOn)}
            right={<Text style={{ fontWeight: '700', color: m.absent ? colors.red : colors.ink }}>{scoreText(m)}</Text>}
            onPress={() => open(m.id)}
          />
        ))}
      </Card>
    </Screen>
  );
}

function Tests() {
  const q = useGet<Tests>('/assessments');
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const invalidate = useInvalidate();
  const [creating, setCreating] = useState(false);
  const canCreate = me.permissions.includes('marks.enter') || me.permissions.includes('marks.manage');
  const d = q.data?.items;
  const open = (id: string) => router.push(`/(app)/marks/${id}` as never);
  return (
    <Screen
      title="Tests"
      refreshing={q.isFetching}
      onRefresh={q.refetch}
      right={
        canCreate ? (
          <Button variant="secondary" icon="add" onPress={() => setCreating(true)}>
            New
          </Button>
        ) : undefined
      }
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.length === 0 && (
        <Card>
          <Empty
            icon="ribbon-outline"
            title="No tests yet"
            body={canCreate ? 'Tap New to create one.' : 'Tests appear here once teachers create them.'}
          />
        </Card>
      )}
      {d && d.length > 0 && (
        <Card>
          {d.map((t) => (
            <Row
              key={t.id}
              title={`${t.subject} · ${t.section}`}
              subtitle={`${t.name} · ${fmtDate(t.heldOn, { day: 'numeric', month: 'short' })}`}
              right={<Badge tone={TONE[t.status] ?? 'slate'}>{LABEL[t.status] ?? t.status}</Badge>}
              onPress={() => open(t.id)}
            />
          ))}
        </Card>
      )}
      {creating && (
        <NewTestSheet
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            invalidate('/assessments');
            open(id);
          }}
        />
      )}
    </Screen>
  );
}
