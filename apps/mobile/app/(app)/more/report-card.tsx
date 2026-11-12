import { Text, View } from 'react-native';
import { Badge, Button, Card, Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { openPdf } from '@/lib/files';
import { colors, font } from '@/lib/theme';

type R = { items: unknown[]; subjects: { subject: string; pct: number; grade: string | null }[] };

export default function ReportCardScreen() {
  const q = useGet<R>('/results/me');
  const d = q.data;
  return (
    <Screen
      title="Report card"
      subtitle="Your average in each subject from published tests."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.subjects.length === 0 && (
        <Card>
          <Empty
            icon="document-text-outline"
            title="No results yet"
            body="Your report card appears once teachers publish marks."
          />
        </Card>
      )}
      {d && d.subjects.length > 0 && (
        <>
          <Card>
            {d.subjects.map((s) => (
              <View
                key={s.subject}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  gap: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <Text style={{ flex: 1, color: colors.ink, fontWeight: '500' }}>{s.subject}</Text>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{s.pct}%</Text>
                {s.grade && <Badge tone={s.pct >= 60 ? 'green' : s.pct >= 40 ? 'amber' : 'red'}>{s.grade}</Badge>}
              </View>
            ))}
          </Card>
          <Button icon="download-outline" onPress={() => openPdf('/report-card/me', 'report-card.pdf')}>
            Download PDF
          </Button>
          <Text style={font.tiny}>Averages include every published test this year.</Text>
        </>
      )}
    </Screen>
  );
}
