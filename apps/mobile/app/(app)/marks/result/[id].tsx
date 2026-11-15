import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { colors, font } from '@/lib/theme';
import type { Results } from '../index';

/** One published test, in full: what it covered, when, the marks and how that compares with the subject overall. */
export default function ResultDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Same query as the Marks tab, so this opens instantly from the cache.
  const q = useGet<Results>('/results/me');
  const m = q.data?.items.find((x) => x.id === id);
  const subject = m ? q.data?.subjects.find((s) => s.subject === m.subject) : undefined;
  return (
    <Screen back title={m?.subject ?? 'Test'} subtitle={m?.name} refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !q.data && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!q.data && q.isLoading && <Loading />}
      {q.data && !m && <Empty icon="ribbon-outline" title="Test not found" body="It may have been unpublished." />}
      {m && (
        <>
          <Card>
            <Text style={font.small}>{m.absent ? 'You were absent' : 'Your marks'}</Text>
            <Text style={[font.display, { color: m.absent ? colors.red : colors.ink }]}>
              {m.absent ? 'A' : `${m.score ?? '—'}/${m.maxMarks}`}
            </Text>
            {!m.absent && (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {m.pct !== null && <Text style={[font.body, { fontWeight: '700', color: colors.ink }]}>{m.pct}%</Text>}
                {m.grade && <Text style={[font.body, { fontWeight: '700', color: colors.deep }]}>Grade {m.grade}</Text>}
              </View>
            )}
          </Card>
          <Card title="About this test">
            <Row title="Chapter" right={m.chapter ?? 'Not given'} />
            <Row title="Date" right={fmtDate(m.heldOn, { weekday: 'short', day: 'numeric', month: 'short' })} />
            <Row title="Out of" right={String(m.maxMarks)} />
            {subject?.pct != null && (
              <Row
                title={`${m.subject} this year`}
                right={`${subject.pct}%${subject.grade ? ` · ${subject.grade}` : ''}`}
              />
            )}
          </Card>
          {m.details ? (
            <Card title="Notes from your teacher">
              <Text style={font.body}>{m.details}</Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
