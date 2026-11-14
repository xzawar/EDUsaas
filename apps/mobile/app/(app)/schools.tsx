import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';

type T = {
  items: {
    id: string;
    name: string;
    prefix: string;
    city: string | null;
    status: string;
    plan?: string | null;
    accounts?: number;
  }[];
};

export default function SchoolsScreen() {
  const q = useGet<T>('/platform/tenants?limit=50');
  const d = q.data;
  return (
    <Screen
      title="Schools"
      subtitle="Metadata only. Never student or teacher records."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty title="No schools yet" />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((t) => (
            <Row
              key={t.id}
              title={t.name}
              subtitle={`${t.prefix}${t.city ? ` · ${t.city}` : ''}${t.plan ? ` · ${t.plan}` : ''}`}
              right={
                <Badge tone={t.status === 'ACTIVE' ? 'green' : t.status === 'TRIAL' ? 'blue' : 'red'}>
                  {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                </Badge>
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
