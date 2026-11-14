import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Card, Empty, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { relative } from '@/lib/format';
import { mapLink } from '@/lib/links';
import { colors } from '@/lib/theme';

type N = {
  items: {
    id: string;
    title: string;
    body: string | null;
    link: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
  unread: number;
};

export default function NotificationsScreen() {
  const q = useGet<N>('/notifications');
  const router = useRouter();
  const invalidate = useInvalidate();
  const d = q.data;
  useEffect(() => {
    if (!d?.unread) return;
    const t = setTimeout(() => {
      void api('/notifications', { body: {} })
        .then(() => invalidate('/notifications'))
        .catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, [d?.unread]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Screen title="Notifications" refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty
            icon="notifications-outline"
            title="All quiet"
            body="Leave decisions, fee receipts and published marks show up here."
          />
        </Card>
      )}
      {d && d.items.length > 0 && (
        <Card>
          {d.items.map((n) => (
            <Row
              key={n.id}
              left={
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: n.readAt ? 'transparent' : colors.accent,
                  }}
                />
              }
              title={n.title}
              subtitle={
                <Text>
                  {n.body ? `${n.body} · ` : ''}
                  {relative(n.createdAt)}
                </Text>
              }
              onPress={n.link ? () => router.push(mapLink(n.link!) as never) : undefined}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
