import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Card, Chip, Empty, ErrorBox, Loading, Money, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate, periodLabel } from '@/lib/format';
import { font } from '@/lib/theme';

type List = {
  items: {
    id: string;
    number: string;
    period: string;
    dueOn: string;
    status: string;
    overdue: boolean;
    totalPaisa: number;
    balancePaisa: number;
    student: { id: string; name: string; section: string | null; rollNumber: number | null };
  }[];
  total: number;
};
const FILTERS = [
  ['OVERDUE', 'Overdue'],
  ['OPEN', 'Unpaid'],
  ['PAID', 'Paid'],
  ['', 'All'],
] as const;

export default function InvoicesScreen() {
  const { status: initial } = useLocalSearchParams<{ status?: string }>();
  const [status, setStatus] = useState(initial ?? 'OPEN');
  const router = useRouter();
  const q = useGet<List>(`/invoices?${status ? `status=${status}` : ''}`);
  const d = q.data;
  return (
    <Screen
      title="Fee bills"
      subtitle={d ? `${d.total} bill${d.total === 1 ? '' : 's'}` : undefined}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map(([k, l]) => (
          <Chip key={k} active={status === k} onPress={() => setStatus(k)}>
            {l}
          </Chip>
        ))}
      </View>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="receipt-outline"
            title="No bills match"
            body="Generate the month’s bills from the web app, then collect here."
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          <Text style={font.tiny}>Showing the first {d.items.length}. Tap a bill to collect.</Text>
          {d.items.map((i) => (
            <Row
              key={i.id}
              title={i.student.name}
              subtitle={`${i.student.section ?? ''} · ${periodLabel(i.period)} · due ${fmtDate(i.dueOn)}`}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Money paisa={i.balancePaisa} style={{ fontWeight: '600' }} />
                  <Badge
                    tone={
                      i.status === 'PAID' ? 'green' : i.overdue ? 'red' : i.status === 'PARTIAL' ? 'amber' : 'slate'
                    }
                  >
                    {i.status === 'PAID'
                      ? 'Paid'
                      : i.status === 'PARTIAL'
                        ? 'Part paid'
                        : i.overdue
                          ? 'Overdue'
                          : 'Due'}
                  </Badge>
                </View>
              }
              onPress={() => router.push({ pathname: '/(app)/collect', params: { student: i.student.id } } as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
