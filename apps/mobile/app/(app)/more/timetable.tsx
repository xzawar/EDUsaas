import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button, Card, Chip, Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';

type Cell = {
  slotId: string;
  isBreak: boolean;
  entry: { subject: string; teacher: string | null; room: string | null; section?: string } | null;
};
type T = {
  days: { day: number; name: string }[];
  periods: { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean }[];
  cells: Record<string, Cell>;
};

/** My week, one day at a time: each period is its time on one line, then the subject and who teaches it. */
export default function TimetableScreen() {
  const me = useSession((s) => s.me)!;
  const student = me.user.role === 'STUDENT';
  const canEdit = me.permissions.includes('timetable.manage');
  const router = useRouter();
  const q = useGet<T>('/timetable/me');
  const d = q.data;
  const jsDay = new Date().getDay() || 7; // Mon=1..Sun=7
  const [day, setDay] = useState<number | null>(null);
  const active = day ?? d?.days.find((x) => x.day === jsDay)?.day ?? d?.days[0]?.day ?? 1;
  const anything = d && Object.values(d.cells).some((c) => c.entry);
  const edit = canEdit ? (
    <Button
      variant="secondary"
      icon="create-outline"
      onPress={() => router.push('/(app)/more/timetable-edit' as never)}
    >
      Edit
    </Button>
  ) : undefined;
  return (
    <Screen back title="Timetable" refreshing={q.isFetching} onRefresh={q.refetch} right={edit}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && !anything && (
        <Card>
          <Empty
            icon="time-outline"
            title={canEdit ? 'Your own timetable is empty' : 'No timetable yet'}
            body={canEdit ? 'Tap Edit to set a class’s timetable.' : 'The school hasn’t set periods for you.'}
          />
        </Card>
      )}
      {d && anything && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {d.days.map((x) => (
              <Chip key={x.day} active={active === x.day} onPress={() => setDay(x.day)}>
                {x.name.slice(0, 3)}
              </Chip>
            ))}
          </View>
          <Card>
            {d.periods.map((p, i) => {
              const c = d.cells[`${active}:${p.periodNo}`];
              const brk = p.isBreak || c?.isBreak;
              // Students see who teaches; teachers see which class.
              const who = c?.entry ? (student ? c.entry.teacher : (c.entry.section ?? c.entry.teacher)) : null;
              return (
                <View
                  key={p.periodNo}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: brk ? 8 : 12,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Text
                    style={{
                      width: 96,
                      fontSize: 14,
                      fontWeight: '700',
                      color: brk ? colors.muted : colors.ink,
                      fontVariant: ['tabular-nums'],
                    }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {p.startsAt}-{p.endsAt}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {brk ? (
                      <Text style={font.small}>Break</Text>
                    ) : c?.entry ? (
                      <>
                        <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 16 }} numberOfLines={1}>
                          {c.entry.subject}
                        </Text>
                        {who ? (
                          <Text style={font.small} numberOfLines={1}>
                            {who}
                            {c.entry.room ? ` · Room ${c.entry.room}` : ''}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={font.small}>Free</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
