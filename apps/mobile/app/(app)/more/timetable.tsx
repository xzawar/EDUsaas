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
              return (
                <View
                  key={p.periodNo}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.line,
                  }}
                >
                  <View style={{ width: 64 }}>
                    <Text style={{ fontWeight: '600', color: colors.ink }}>{brk ? 'Break' : `P${p.periodNo}`}</Text>
                    <Text style={font.tiny}>
                      {p.startsAt}–{p.endsAt}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {brk ? (
                      <Text style={font.small}>—</Text>
                    ) : c?.entry ? (
                      <>
                        <Text style={{ fontWeight: '600', color: colors.ink }}>{c.entry.subject}</Text>
                        <Text style={font.small}>
                          {[c.entry.section, c.entry.teacher, c.entry.room].filter(Boolean).join(' · ')}
                        </Text>
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
