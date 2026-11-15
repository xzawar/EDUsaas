import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Card, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { METHOD_LABELS, periodLabel, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';

type O = {
  today: string;
  month: string;
  collectedTodayPaisa: number;
  monthCollectedPaisa: number;
  monthInvoicedPaisa: number;
  monthBills: number;
  monthExpensesPaisa: number;
  outstandingPaisa: number;
  defaulters: number;
  claimsPending: number;
  recentPayments: { id: string; receiptNumber: string; student: string; amountPaisa: number; method: string }[];
};

function Line({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 6 }}>
      <Text style={[strong ? font.h2 : font.body, tone ? { color: tone } : null]}>{label}</Text>
      <Money
        paisa={value}
        style={[strong ? font.number : { fontSize: 17, fontWeight: '700' }, { color: tone ?? colors.ink }]}
      />
    </View>
  );
}

/**
 * School Admin money view, told as a story: this month's money in and out, how much of the bills is paid, who still
 * owes, and today's counter. Every number has its words next to it.
 */
export default function FinanceScreen() {
  const me = useSession((s) => s.me)!;
  const q = useGet<O>('/finance/overview');
  const router = useRouter();
  const d = q.data;
  const collect = me.permissions.includes('fees.collect');
  const go = (href: string) => router.push(href as never);
  const left = d ? d.monthCollectedPaisa - d.monthExpensesPaisa : 0;
  const paidShare = d && d.monthInvoicedPaisa > 0 ? Math.min(1, d.monthCollectedPaisa / d.monthInvoicedPaisa) : 0;
  return (
    <Screen
      title="Finance"
      subtitle={d ? periodLabel(d.month) : undefined}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <Card title="This month">
            <Line label="Came in (fees)" value={d.monthCollectedPaisa} tone={colors.green} />
            <Line label="Went out (expenses, salaries)" value={d.monthExpensesPaisa} tone={colors.red} />
            <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />
            <Line label={left >= 0 ? 'Left over' : 'Short by'} value={Math.abs(left)} strong />
          </Card>
          {d.monthBills > 0 && (
            <Card title="Bills paid">
              <Text style={font.body}>
                <Money paisa={d.monthCollectedPaisa} style={{ fontWeight: '700', color: colors.ink }} /> of{' '}
                <Money paisa={d.monthInvoicedPaisa} style={{ fontWeight: '700', color: colors.ink }} /> billed (
                {Math.round(paidShare * 100)}%)
              </Text>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: '#fff', overflow: 'hidden', marginTop: 4 }}>
                <View style={{ width: `${paidShare * 100}%`, height: 10, backgroundColor: colors.brand }} />
              </View>
            </Card>
          )}
          <Card>
            <Row
              title="Still owed"
              subtitle={d.defaulters ? `${plural(d.defaulters, 'student')} late` : 'Nobody is late'}
              right={
                <Money paisa={d.outstandingPaisa} style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }} />
              }
              onPress={() => go('/(app)/more/reports')}
            />
            <Row
              title="Collected today"
              right={
                <Money paisa={d.collectedTodayPaisa} style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }} />
              }
              onPress={collect ? () => go('/(app)/collect') : undefined}
            />
            {d.claimsPending > 0 && collect && (
              <Row
                title="Payment proofs to check"
                right={<Text style={{ fontWeight: '700', color: colors.ink, fontSize: 17 }}>{d.claimsPending}</Text>}
                onPress={() => go('/(app)/claims')}
              />
            )}
            <Row
              title="Expenses"
              subtitle="Add or see this month’s spending"
              onPress={() => go('/(app)/more/expenses')}
            />
          </Card>
          {d.recentPayments.length > 0 && (
            <Card title="Latest payments">
              {d.recentPayments.slice(0, 3).map((p) => (
                <Row
                  key={p.id}
                  title={p.student}
                  subtitle={METHOD_LABELS[p.method] ?? p.method}
                  right={<Money paisa={p.amountPaisa} style={{ fontWeight: '700', color: colors.ink }} />}
                />
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
