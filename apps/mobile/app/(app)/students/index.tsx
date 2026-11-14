import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Card, Empty, ErrorBox, Input, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { useSession } from '@/lib/session';

type List = {
  items: {
    id: string;
    name: string;
    username: string;
    rollNumber: number | null;
    section: string | null;
    guardianPhone: string | null;
    status: string;
  }[];
  total: number;
};

export default function StudentsScreen() {
  const me = useSession((s) => s.me)!;
  const [q, setQ] = useState('');
  const router = useRouter();
  const list = useGet<List>(`/students?limit=100${q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : ''}`);
  const d = list.data;
  return (
    <Screen
      title={me.user.role === 'TEACHER' ? 'My students' : 'Students'}
      subtitle={d ? `${d.total} active` : undefined}
      refreshing={list.isFetching}
      onRefresh={list.refetch}
    >
      <Input
        placeholder="Search by name or username"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {list.isError && !d && <ErrorBox message={errorText(list.error)} onRetry={list.refetch} />}
      {!d && list.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="school-outline"
            title="No students"
            body={q ? 'Try another name.' : 'Students you can see appear here.'}
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((s) => (
            <Row
              key={s.id}
              title={s.name}
              subtitle={`${s.username} · ${s.section ?? 'Unplaced'}${s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}`}
              onPress={() => router.push(`/(app)/students/${s.id}` as never)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
