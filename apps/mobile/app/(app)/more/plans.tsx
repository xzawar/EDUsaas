import { Text } from 'react-native';
import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { colors, font } from '@/lib/theme';

type P = {
  items: {
    id: string;
    name: string;
    priceMonthly: number;
    maxStudents: number | null;
    active: boolean;
    schools: number;
  }[];
};

export default function PlansScreen() {
  const q = useGet<P>('/platform/plans');
  const d = q.data;
  return (
    <Screen title="Plans" subtitle="Edit plans on the web console." refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty icon="pricetags-outline" title="No plans yet" />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((p) => (
            <Row
              key={p.id}
              title={p.name}
              subtitle={`${p.schools} school${p.schools === 1 ? '' : 's'}${p.maxStudents ? ` · up to ${p.maxStudents} students` : ''}`}
              right={
                <>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>
                    {p.priceMonthly ? `PKR ${p.priceMonthly.toLocaleString()}` : 'Free'}
                  </Text>
                  {!p.active && <Badge tone="slate">Retired</Badge>}
                </>
              }
            />
          ))}
          <Text style={font.tiny}>Price per month.</Text>
        </Card>
      )}
    </Screen>
  );
}
