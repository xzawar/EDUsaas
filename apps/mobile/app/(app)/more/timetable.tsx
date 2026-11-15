import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Card, Chip, Empty, ErrorBox, Loading, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
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

export default function TimetableScreen() {
  const q = useGet<T>('/timetable/me');
  const d = q.data;
  const jsDay = new Date().getDay() || 7; // Mon=1..Sun=7
  const [day, setDay] = useState<number | null>(null);
  const active = day ?? d?.days.find((x) => x.day === jsDay)?.day ?? d?.days[0]?.day ?? 1;
  const anything = d && Object.values(d.cells).some((c) => c.entry);
  return (
    <Screen title="Timetable" refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && !anything && (
        <Card>
          <Empty icon="time-outline" title="No timetable yet" body="The school hasn’t set periods for you." />
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
            {d.periods.map((p) => {
              const c = d.cells[`${active}:${p.periodNo}`];
              const brk = p.isBreak || c?.isBreak;
              const who = c?.entry ? (c.entry.section ?? c.entry.teacher) : null;
              // One line per period: start–end, then the subject (and who/where), never wrapping.
              return (
                <View
                  key={p.periodNo}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: brk ? 6 : 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <Text
                    style={{
                      width: 104,
                      fontWeight: '700',
                      color: brk ? colors.muted : colors.ink,
                      fontVariant: ['tabular-nums'],
                    }}
                    numberOfLines={1}
                  >
                    {p.startsAt}–{p.endsAt}
                  </Text>
                  <Text style={{ flex: 1 }} numberOfLines={1}>
                    {brk ? (
                      <Text style={font.small}>Break</Text>
                    ) : c?.entry ? (
                      <>
                        <Text style={{ fontWeight: '700', color: colors.ink }}>{c.entry.subject}</Text>
                        {who ? <Text style={font.small}> · {who}</Text> : null}
                      </>
                    ) : (
                      <Text style={font.small}>Free</Text>
                    )}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}
