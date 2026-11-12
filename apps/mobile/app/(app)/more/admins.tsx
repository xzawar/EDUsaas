import { Badge, Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { relative } from '@/lib/format';

type A = {
  admins: {
    id: string;
    displayName: string;
    email: string | null;
    status: string;
    lastLoginAt: string | null;
    permissions: string[];
  }[];
};

export default function AdminsScreen() {
  const q = useGet<A>('/platform/admins');
  const d = q.data;
  return (
    <Screen
      title="Platform admins"
      subtitle="Add admins and change grants on the web console."
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.admins.length === 0 && (
        <Card>
          <Empty icon="shield-outline" title="Only you so far" />
        </Card>
      )}
      {d && d.admins.length > 0 && (
        <Card>
          {d.admins.map((a) => (
            <Row
              key={a.id}
              title={a.displayName}
              subtitle={`${a.email ?? ''} · ${a.permissions.length} grants · ${a.lastLoginAt ? `seen ${relative(a.lastLoginAt)}` : 'never signed in'}`}
              right={
                <Badge tone={a.status === 'ACTIVE' ? 'green' : 'red'}>
                  {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                </Badge>
              }
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
