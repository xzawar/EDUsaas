import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';
import { openPdf } from '@/lib/files';

type Results = {
  items: {
    id: string;
    subject: string;
    name: string;
    heldOn: string;
    score: number | null;
    absent: boolean;
    maxMarks: number;
    pct: number | null;
    grade: string | null;
  }[];
  subjects: { subject: string; pct: number | null; grade: string | null }[];
};
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

function MyMarks() {
  const q = useGet<Results>('/results/me');
  const d = q.data;
  return (
    <Screen
      title="Marks"
      subtitle="Published marks for this year."
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
      {d && d.subjects.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {d.subjects.map((s) => (
            <View
              key={s.subject}
              style={{ backgroundColor: colors.card, borderRadius: 16, padding: 12, minWidth: '47%', flexGrow: 1 }}
            >
              <Text style={font.small}>{s.subject}</Text>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.ink }}>
                {s.pct === null ? '—' : `${s.pct}%`}
                {s.grade ? <Text style={{ fontSize: 14, color: colors.accent }}> {s.grade}</Text> : null}
              </Text>
            </View>
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
            title={`${m.subject} · ${m.name}`}
            subtitle={fmtDate(m.heldOn)}
            right={
              <Text style={{ fontWeight: '600', color: colors.ink }}>
                {m.absent ? 'Absent' : `${m.score ?? '—'} / ${m.maxMarks}`}
                {m.grade ? ` · ${m.grade}` : ''}
              </Text>
            }
          />
        ))}
      </Card>
    </Screen>
  );
}

function Tests() {
  const q = useGet<Tests>('/assessments');
  const router = useRouter();
  const d = q.data?.items;
  return (
    <Screen
      title="Tests & marks"
      subtitle="Tap a test to enter or check marks."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.length === 0 && (
        <Card>
          <Empty
            icon="ribbon-outline"
            title="No tests yet"
            body="Create tests on the web app; enter marks here, even offline."
          />
        </Card>
      )}
      {d && d.length > 0 && (
        <Card>
          {d.map((t) => (
            <Row
              key={t.id}
              title={`${t.section} · ${t.subject}`}
              subtitle={`${t.name} · ${fmtDate(t.heldOn)} · out of ${t.maxMarks}`}
              right={<Badge tone={TONE[t.status] ?? 'slate'}>{LABEL[t.status] ?? t.status}</Badge>}
              onPress={() => router.push(`/(app)/marks/${t.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
