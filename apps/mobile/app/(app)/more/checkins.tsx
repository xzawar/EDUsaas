import { View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtTime } from '@/lib/format';
import { font } from '@/lib/theme';

type B = {
  date: string;
  list: { teacherId: string; name: string; status: string | null; checkedInAt: string | null; corrected: boolean }[];
  summary: { present: number; late: number; absent: number; leave: number; missing: number; total: number };
};
const TONE: Record<string, 'green' | 'amber' | 'red' | 'blue'> = {
  PRESENT: 'green',
  LATE: 'amber',
  ABSENT: 'red',
  LEAVE: 'blue',
};

export default function CheckinsScreen() {
  const q = useGet<B>('/teacher-attendance');
  const d = q.data;
  return (
    <Screen
      title="Teacher check-ins"
      subtitle="Today. Corrections are made on the web."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.list.length === 0 && (
        <Card>
          <Empty icon="people-outline" title="No teachers yet" />
        </Card>
      )}
      {d && d.list.length > 0 && (
        <>
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Badge tone="green">{d.summary.present} in</Badge>
              <Badge tone="amber">{d.summary.late} late</Badge>
              <Badge tone="blue">{d.summary.leave} on leave</Badge>
              <Badge tone="red">{d.summary.absent} absent</Badge>
              <Badge tone="slate">{d.summary.missing} not yet</Badge>
            </View>
          </Card>
          <Card>
            {d.list.map((t) => (
              <Row
                key={t.teacherId}
                title={t.name}
                subtitle={
                  t.checkedInAt ? `Checked in ${fmtTime(t.checkedInAt)}${t.corrected ? ' · corrected' : ''}` : undefined
                }
                right={
                  t.status ? (
                    <Badge tone={TONE[t.status] ?? 'slate'}>
                      {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                    </Badge>
                  ) : (
                    <Text style={font.tiny}>Not yet</Text>
                  )
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
