import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackChip } from '@/components/header';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Empty, ErrorBox, Field, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { colors, font, space } from '@/lib/theme';

type Sections = { items: { id: string; label: string }[] };
type Cell = {
  slotId: string;
  isBreak: boolean;
  entry: { subject: string; subjectId: string; teacher: string | null; teacherId: string | null } | null;
};
type Grid = {
  section: { id: string; label: string };
  subjects: { id: string; name: string; teachers: { id: string; name: string }[] }[];
  days: { day: number; name: string }[];
  periods: { periodNo: number; startsAt: string; endsAt: string; isBreak: boolean }[];
  cells: Record<string, Cell>;
};

/**
 * Set a class's timetable on the phone: pick the class and the day, tap a period, choose the subject and its
 * teacher. Clashes (a teacher in two rooms at once) are refused with a plain reason.
 */
export default function TimetableEditScreen() {
  const sections = useGet<Sections>('/sections');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const chosen = sectionId ?? sections.data?.items[0]?.id ?? null;
  const grid = useGet<Grid>(chosen ? `/timetable/sections/${chosen}` : null);
  const invalidate = useInvalidate();
  const jsDay = new Date().getDay() || 7;
  const [day, setDay] = useState<number | null>(null);
  const g = grid.data;
  const active = day ?? g?.days.find((x) => x.day === jsDay)?.day ?? g?.days[0]?.day ?? 1;
  const [editing, setEditing] = useState<{ slotId: string; label: string; cell: Cell['entry'] } | null>(null);

  return (
    <Screen back title="Set timetable" refreshing={grid.isFetching} onRefresh={grid.refetch}>
      {sections.isError && <ErrorBox message={errorText(sections.error)} onRetry={sections.refetch} />}
      {!sections.data && <Loading />}
      {sections.data && sections.data.items.length === 0 && (
        <Card>
          <Empty icon="time-outline" title="No classes this year" body="Add classes on the web first." />
        </Card>
      )}
      {sections.data && sections.data.items.length > 0 && (
        <Field label="Class">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {sections.data.items.map((s) => (
              <Chip key={s.id} active={chosen === s.id} onPress={() => setSectionId(s.id)}>
                {s.label}
              </Chip>
            ))}
          </ScrollView>
        </Field>
      )}
      {grid.isError && !g && <ErrorBox message={errorText(grid.error)} onRetry={grid.refetch} />}
      {chosen && !g && grid.isLoading && <Loading />}
      {g && g.periods.length === 0 && (
        <Card>
          <Empty icon="time-outline" title="No periods yet" body="Set the school’s period times on the web first." />
        </Card>
      )}
      {g && g.periods.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.days.map((x) => (
              <Chip key={x.day} active={active === x.day} onPress={() => setDay(x.day)}>
                {x.name.slice(0, 3)}
              </Chip>
            ))}
          </View>
          <Card>
            {g.periods.map((p, i) => {
              const c = g.cells[`${active}:${p.periodNo}`];
              const brk = p.isBreak || c?.isBreak;
              return (
                <Pressable
                  key={p.periodNo}
                  disabled={brk || !c}
                  accessibilityRole="button"
                  onPress={() =>
                    c && setEditing({ slotId: c.slotId, label: `${p.startsAt}-${p.endsAt}`, cell: c.entry })
                  }
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: brk ? 8 : 12,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: colors.line,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text style={{ width: 96, fontSize: 14, fontWeight: '700', color: brk ? colors.muted : colors.ink }}>
                    {p.startsAt}-{p.endsAt}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    {brk ? (
                      <Text style={font.small}>Break</Text>
                    ) : c?.entry ? (
                      <>
                        <Text style={{ fontWeight: '700', color: colors.ink }} numberOfLines={1}>
                          {c.entry.subject}
                        </Text>
                        <Text style={font.small} numberOfLines={1}>
                          {c.entry.teacher ?? 'No teacher yet'}
                        </Text>
                      </>
                    ) : (
                      <Text style={[font.small, { color: colors.deep, fontWeight: '600' }]}>Tap to add a lesson</Text>
                    )}
                  </View>
                  {!brk && <Icon name="create-outline" size={18} color={colors.muted} />}
                </Pressable>
              );
            })}
          </Card>
        </>
      )}
      {editing && g && (
        <LessonSheet
          grid={g}
          slot={editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) {
              void grid.refetch();
              invalidate('/timetable');
            }
          }}
        />
      )}
    </Screen>
  );
}

function LessonSheet({
  grid,
  slot,
  onClose,
}: {
  grid: Grid;
  slot: { slotId: string; label: string; cell: Cell['entry'] };
  onClose: (saved: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [subjectId, setSubjectId] = useState<string | null>(slot.cell?.subjectId ?? null);
  const [teacherId, setTeacherId] = useState<string | null>(slot.cell?.teacherId ?? null);
  const [busy, setBusy] = useState(false);
  const subject = grid.subjects.find((s) => s.id === subjectId);

  async function save(clear = false) {
    setBusy(true);
    const r = await api('/timetable/entries', {
      method: 'PUT',
      body: {
        sectionId: grid.section.id,
        slotId: slot.slotId,
        subjectId: clear ? null : subjectId,
        teacherId: clear ? null : teacherId,
      },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', clear ? 'Period cleared' : 'Lesson saved');
    onClose(true);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => onClose(false)}>
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 16, paddingBottom: 40, gap: space.lg }}
      >
        <View style={{ flexDirection: 'row' }}>
          <BackChip onPress={() => onClose(false)} />
        </View>
        <Text style={font.h1}>{grid.section.label}</Text>
        <Text style={font.body}>{slot.label}</Text>
        <Field label="Subject">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {grid.subjects.map((s) => (
              <Chip
                key={s.id}
                active={subjectId === s.id}
                onPress={() => {
                  setSubjectId(s.id);
                  // The class's own teacher for that subject is the usual choice.
                  setTeacherId(s.teachers[0]?.id ?? null);
                }}
              >
                {s.name}
              </Chip>
            ))}
          </View>
        </Field>
        {subject && (
          <Field label="Teacher">
            {subject.teachers.length === 0 ? (
              <Text style={font.small}>No teacher is assigned to {subject.name} in this class yet.</Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {subject.teachers.map((t) => (
                  <Chip key={t.id} active={teacherId === t.id} onPress={() => setTeacherId(t.id)}>
                    {t.name}
                  </Chip>
                ))}
              </View>
            )}
          </Field>
        )}
        <Button onPress={() => save()} loading={busy} disabled={!subjectId}>
          Save lesson
        </Button>
        {slot.cell && (
          <Button variant="ghost" onPress={() => save(true)} disabled={busy}>
            Make this period free
          </Button>
        )}
      </ScrollView>
    </Modal>
  );
}
