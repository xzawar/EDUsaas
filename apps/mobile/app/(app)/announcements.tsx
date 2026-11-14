import { Card, Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { colors, font } from '@/lib/theme';

type A = {
  id: string;
  title: string;
  body: string;
  audienceLabel: string;
  pinned: boolean;
  createdAt: string;
  author: string;
  expired: boolean;
};

export default function AnnouncementsScreen() {
  const q = useGet<{ items: A[] }>('/announcements');
  const d = q.data;
  return (
    <Screen title="Announcements" refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && d.items.length === 0 && (
        <Card>
          <Empty icon="megaphone-outline" title="Nothing posted yet" />
        </Card>
      )}
      {d?.items
        .filter((a) => !a.expired)
        .map((a) => (
          <Card key={a.id}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{a.title}</Text>
            <Text style={font.body}>{a.body}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Text style={font.tiny}>
                {a.pinned ? '📌 ' : ''}
                {fmtDate(a.createdAt)} · {a.author} · {a.audienceLabel}
              </Text>
            </View>
          </Card>
        ))}
    </Screen>
  );
}
