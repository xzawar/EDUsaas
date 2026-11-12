import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Card, ErrorBox, Loading, Money, Row, Screen, Stat } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { periodLabel, plural } from '@/lib/format';
import { useSession } from '@/lib/session';
import { font } from '@/lib/theme';

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

/** School Admin / Principal money view. */
export default function FinanceScreen() {
  const me = useSession((s) => s.me)!;
  const q = useGet<O>('/finance/overview');
  const router = useRouter();
  const d = q.data;
  const collect = me.permissions.includes('fees.collect');
  return (
    <Screen
      title="Finance"
      subtitle="Money in, money out, what’s still owed."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Stat
              tone="mint"
              icon="cash-outline"
              title="Collected today"
              value={<Money paisa={d.collectedTodayPaisa} />}
              onPress={collect ? () => router.push('/(app)/collect' as never) : undefined}
            />
            <Stat
              tone="violet"
              icon="receipt-outline"
              title={periodLabel(d.month)}
              value={<Money paisa={d.monthCollectedPaisa} />}
              caption={
                d.monthBills ? `of ${Math.round(d.monthInvoicedPaisa / 100).toLocaleString()} billed` : 'No bills yet'
              }
              onPress={collect ? () => router.push('/(app)/invoices' as never) : undefined}
            />
            <Stat
              tone="amber"
              icon="alert-circle-outline"
              title="Outstanding"
              value={<Money paisa={d.outstandingPaisa} />}
              caption={plural(d.defaulters, 'student') + ' overdue'}
              onPress={() => router.push('/(app)/more/reports' as never)}
            />
            <Stat
              tone="pink"
              icon="bag-outline"
              title="Spent this month"
              value={<Money paisa={d.monthExpensesPaisa} />}
              caption="Expenses and salaries"
              onPress={() => router.push('/(app)/more/expenses' as never)}
            />
          </View>
          {d.claimsPending > 0 && collect && (
            <Card>
              <Row
                title={`${plural(d.claimsPending, 'payment proof')} to check`}
                onPress={() => router.push('/(app)/claims' as never)}
              />
            </Card>
          )}
          <Card title="Recent payments">
            {d.recentPayments.length === 0 ? (
              <Text style={font.small}>No payments yet.</Text>
            ) : (
              d.recentPayments.map((p) => (
                <Row
                  key={p.id}
                  title={p.student}
                  subtitle={`${p.receiptNumber} · ${p.method}`}
                  right={<Money paisa={p.amountPaisa} style={{ fontWeight: '600' }} />}
                />
              ))
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
