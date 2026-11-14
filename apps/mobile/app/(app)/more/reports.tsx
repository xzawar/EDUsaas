import { useState } from 'react';
import { Linking, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Chip, Empty, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate, plural } from '@/lib/format';
import { colors, font } from '@/lib/theme';

type Summary = {
  label: string;
  bills: number;
  invoicedPaisa: number;
  collectedPaisa: number;
  expensesPaisa: number;
  salariesPaisa: number;
  netPaisa: number;
  outstandingPaisa: number;
  expensesByCategory: { category: string; amountPaisa: number }[];
};
type Def = {
  asOf: string;
  totalPaisa: number;
  students: number;
  rows: {
    studentId: string;
    name: string;
    section: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    bills: number;
    balancePaisa: number;
    oldestDue: string;
  }[];
};

function Line({ label, paisa, strong }: { label: string; paisa: number; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={strong ? { fontWeight: '700', color: colors.ink } : font.body}>{label}</Text>
      <Money paisa={paisa} style={strong ? { fontWeight: '700' } : undefined} />
    </View>
  );
}

export default function ReportsScreen() {
  const [tab, setTab] = useState<'summary' | 'defaulters'>('summary');
  const s = useGet<Summary>(tab === 'summary' ? '/finance/reports/summary' : null);
  const d = useGet<Def>(tab === 'defaulters' ? '/finance/reports/defaulters' : null);
  const q = tab === 'summary' ? s : d;
  return (
    <Screen
      title="Money reports"
      subtitle="Full reports and Excel downloads are on the web."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip active={tab === 'summary'} onPress={() => setTab('summary')}>
          This month
        </Chip>
        <Chip active={tab === 'defaulters'} onPress={() => setTab('defaulters')}>
          Who owes
        </Chip>
      </View>
      {q.isError && !q.data && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!q.data && q.isLoading && <Loading />}
      {tab === 'summary' && s.data && (
        <>
          <Card title={s.data.label}>
            <Line label={`Billed (${plural(s.data.bills, 'bill')})`} paisa={s.data.invoicedPaisa} />
            <Line label="Collected" paisa={s.data.collectedPaisa} />
            <Line label="Expenses" paisa={-s.data.expensesPaisa} />
            <Line label="Salaries" paisa={-s.data.salariesPaisa} />
            <Line label="Net" paisa={s.data.netPaisa} strong />
            <Line label="Still owed (all months)" paisa={s.data.outstandingPaisa} />
          </Card>
          {s.data.expensesByCategory.length > 0 && (
            <Card title="Where the money went">
              {s.data.expensesByCategory.map((e) => (
                <Line key={e.category} label={e.category} paisa={e.amountPaisa} />
              ))}
            </Card>
          )}
        </>
      )}
      {tab === 'defaulters' && d.data && (
        <>
          <Card>
            <Text style={font.tiny}>As of {fmtDate(d.data.asOf)}</Text>
            <Money paisa={d.data.totalPaisa} style={{ fontSize: 26, fontWeight: '700', color: colors.red }} />
            <Text style={font.small}>{plural(d.data.students, 'student')} with overdue fees</Text>
            {d.data.rows.length > 100 && (
              <Text style={font.tiny}>
                Showing the 100 youngest classes first. The full list is in Reports on the web.
              </Text>
            )}
          </Card>
          {d.data.rows.length === 0 ? (
            <Card>
              <Empty icon="happy-outline" title="Nobody owes anything" />
            </Card>
          ) : (
            <Card>
              {d.data.rows.slice(0, 100).map((r) => (
                <Row
                  key={r.studentId}
                  title={r.name}
                  subtitle={`${r.section ?? ''} · ${plural(r.bills, 'bill')} · since ${fmtDate(r.oldestDue)}`}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Money paisa={r.balancePaisa} style={{ fontWeight: '600' }} />
                      {!!r.guardianPhone && (
                        <Button
                          variant="ghost"
                          icon="call-outline"
                          onPress={() => Linking.openURL(`tel:${r.guardianPhone}`)}
                        >
                          Call
                        </Button>
                      )}
                    </View>
                  }
                />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
