import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { MergeClerkSheet } from '@/screens/MergeClerkSheet';
import { colors } from '@/lib/theme';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Input, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { ROLE_LABELS } from '@/lib/format';
import { useSession } from '@/lib/session';

type Students = {
  items: { id: string; name: string; username: string; rollNumber: number | null; section: string | null }[];
  total: number;
};
type Staff = {
  items: { id: string; displayName: string; role: string; username: string | null; email?: string; status: string }[];
};
type TeacherHome = { overview?: { sections: { id: string; label: string; isIncharge: boolean }[] } | null };

/**
 * People. Teachers: their students, switched by class. School Admin and Principal: Students or Staff. The office can
 * add a student here.
 */
export default function PeopleScreen() {
  const me = useSession((s) => s.me)!;
  const can = (p: string) => me.permissions.includes(p);
  const params = useLocalSearchParams<{ sectionId?: string }>();
  const router = useRouter();
  const teacher = me.user.role === 'TEACHER';
  const [who, setWho] = useState<'students' | 'staff'>('students');
  const [q, setQ] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(params.sectionId ?? null);
  // A teacher's classes come from their home payload (already cached from the Today tab).
  const home = useGet<TeacherHome>(teacher ? '/mobile/home' : null);
  const classes = home.data?.overview?.sections ?? [];
  const term = q.trim().length >= 2 ? `&q=${encodeURIComponent(q.trim())}` : '';
  const students = useGet<Students>(
    who === 'students' ? `/students?limit=100${sectionId ? `&sectionId=${sectionId}` : ''}${term}` : null,
  );
  const staff = useGet<Staff>(who === 'staff' ? `/users?limit=50${term}` : null);
  const list = who === 'students' ? students : staff;
  const staffRows = staff.data?.items.filter((u) => u.role !== 'STUDENT') ?? [];
  const [merging, setMerging] = useState(false);
  const activeOf = (role: string) => staffRows.filter((u) => u.role === role && u.status === 'ACTIVE');
  const canMerge =
    can('users.manage') && activeOf('ACCOUNTANT').length > 0 && activeOf('ADMISSIONS_OFFICER').length > 0;

  return (
    <Screen
      title={teacher ? 'My students' : 'People'}
      refreshing={list.isFetching}
      onRefresh={list.refetch}
      right={
        can('students.write') && who === 'students' ? (
          <Button variant="secondary" icon="add" onPress={() => router.push('/(app)/students/new' as never)}>
            Add
          </Button>
        ) : undefined
      }
    >
      {can('users.read') && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip active={who === 'students'} onPress={() => setWho('students')}>
            Students
          </Chip>
          <Chip active={who === 'staff'} onPress={() => setWho('staff')}>
            Staff
          </Chip>
        </View>
      )}
      {teacher && classes.length > 1 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip active={!sectionId} onPress={() => setSectionId(null)}>
            All
          </Chip>
          {classes.map((c) => (
            <Chip key={c.id} active={sectionId === c.id} onPress={() => setSectionId(c.id)}>
              {c.label}
            </Chip>
          ))}
        </View>
      )}
      <Input
        placeholder={who === 'staff' ? 'Search staff' : 'Search by name'}
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {list.isError && !list.data && <ErrorBox message={errorText(list.error)} onRetry={list.refetch} />}
      {!list.data && list.isLoading && <Loading />}
      {who === 'students' && students.data && (
        <Card>
          {students.data.items.length === 0 ? (
            <Empty icon="school-outline" title="No students" body={q ? 'Try another name.' : undefined} />
          ) : (
            students.data.items.map((s) => (
              <Row
                key={s.id}
                left={<Avatar name={s.name} />}
                title={s.name}
                subtitle={s.section ? `${s.section}${s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}` : 'Not placed'}
                onPress={() => router.push(`/(app)/students/${s.id}` as never)}
              />
            ))
          )}
        </Card>
      )}
      {who === 'staff' && canMerge && !term && (
        <Card>
          <Row
            left={<Icon name="people-outline" size={22} color={colors.deep} />}
            title="Make one Clerk"
            subtitle="Merge the accountant and admissions into one account"
            onPress={() => setMerging(true)}
          />
        </Card>
      )}
      {merging && (
        <MergeClerkSheet
          accountants={activeOf('ACCOUNTANT')}
          admissions={activeOf('ADMISSIONS_OFFICER')}
          onClose={(merged) => {
            setMerging(false);
            if (merged) void staff.refetch();
          }}
        />
      )}
      {who === 'staff' && staff.data && (
        <Card>
          {staffRows.length === 0 ? (
            <Empty icon="people-outline" title="No staff found" />
          ) : (
            staffRows.map((u) => (
              <Row
                key={u.id}
                left={<Avatar name={u.displayName} />}
                title={u.displayName}
                subtitle={ROLE_LABELS[u.role] ?? u.role}
                right={u.status !== 'ACTIVE' ? <Badge>Off</Badge> : undefined}
                onPress={() => router.push(`/(app)/students/staff/${u.id}` as never)}
              />
            ))
          )}
        </Card>
      )}
    </Screen>
  );
}
