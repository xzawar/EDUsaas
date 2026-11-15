import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Input, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { useSession } from '@/lib/session';

type T = {
  items: {
    id: string;
    name: string;
    prefix: string;
    city: string | null;
    status: string;
    plan: string | null;
    userCount: number;
  }[];
};
export const SCHOOL_STATUS: Record<string, { label: string; tone: 'green' | 'blue' | 'red' }> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  TRIAL: { label: 'Trial', tone: 'blue' },
  SUSPENDED: { label: 'Suspended', tone: 'red' },
};

/** Every school on EDUsaas. Tap one to manage its plan, suspend it or delete it. */
export default function SchoolsScreen() {
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const term = q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : '';
  const list = useGet<T>(`/platform/tenants?limit=50${status ? `&status=${status}` : ''}${term}`);
  const d = list.data;
  return (
    <Screen
      title="Schools"
      refreshing={list.isFetching}
      onRefresh={list.refetch}
      right={
        me.permissions.includes('platform.tenants.manage') ? (
          <Button variant="secondary" icon="add" onPress={() => router.push('/(app)/schools/new' as never)}>
            Add
          </Button>
        ) : undefined
      }
    >
      <Input placeholder="Search schools" value={q} onChangeText={setQ} autoCorrect={false} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[null, 'ACTIVE', 'TRIAL', 'SUSPENDED'].map((s) => (
          <Chip key={s ?? 'all'} active={status === s} onPress={() => setStatus(s)}>
            {s ? SCHOOL_STATUS[s]!.label : 'All'}
          </Chip>
        ))}
      </View>
      {list.isError && !d && <ErrorBox message={errorText(list.error)} onRetry={list.refetch} />}
      {!d && list.isLoading && <Loading />}
      {d && (
        <Card>
          {d.items.length === 0 ? (
            <Empty icon="business-outline" title="No schools" />
          ) : (
            d.items.map((t) => (
              <Row
                key={t.id}
                title={t.name}
                subtitle={`${t.plan ?? 'No plan'} · ${t.userCount} accounts`}
                right={
                  <Badge tone={SCHOOL_STATUS[t.status]?.tone ?? 'blue'}>
                    {SCHOOL_STATUS[t.status]?.label ?? t.status}
                  </Badge>
                }
                onPress={() => router.push({ pathname: '/(app)/schools/[id]', params: { id: t.id } } as never)}
              />
            ))
          )}
        </Card>
      )}
    </Screen>
  );
}
