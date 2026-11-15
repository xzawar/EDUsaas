import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Button, Card, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { ROLE_LABELS, relative } from '@/lib/format';
import { useSession } from '@/lib/session';
import { font } from '@/lib/theme';
import { LoginSheet } from '@/screens/LoginSheet';

type U = {
  user: {
    id: string;
    displayName: string;
    role: string;
    username: string | null;
    email?: string | null;
    status: string;
    lastLoginAt: string | null;
  };
};

/** A staff member: role and sign-in. The School Admin can set their username/email and password, or switch them off. */
export default function StaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me)!;
  const q = useGet<U>(`/users/${id}`);
  const invalidate = useInvalidate();
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const u = q.data?.user;
  const admin = me.permissions.includes('users.manage');
  const editable = admin && u && u.role !== 'SCHOOL_ADMIN' && u.id !== me.user.id;

  async function toggle() {
    if (!u) return;
    setBusy(true);
    const r = await api(`/users/${u.id}/status`, {
      method: 'PATCH',
      body: { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
    }).catch(() => null);
    setBusy(false);
    if (!r) return toast('error', 'No connection');
    if (!r.ok) return toast('error', r.error.message);
    toast('success', u.status === 'ACTIVE' ? 'Switched off' : 'Switched on');
    invalidate('/users');
  }

  return (
    <Screen back refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !u && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!u && q.isLoading && <Loading />}
      {u && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Avatar name={u.displayName} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={font.title}>{u.displayName}</Text>
              <Text style={font.small}>{ROLE_LABELS[u.role] ?? u.role}</Text>
            </View>
          </View>
          <Card>
            <Row title="Signs in with" right={u.username ?? u.email ?? '—'} />
            <Row title="Status" right={u.status === 'ACTIVE' ? 'Active' : 'Switched off'} />
            <Row title="Last sign-in" right={u.lastLoginAt ? relative(u.lastLoginAt) : 'Never'} />
          </Card>
          {editable && (
            <>
              <Button icon="key-outline" onPress={() => setLogin(true)}>
                Change sign-in
              </Button>
              {u.role !== 'TEACHER' && (
                <Button variant="ghost" loading={busy} onPress={toggle}>
                  {u.status === 'ACTIVE' ? 'Switch off this account' : 'Switch it back on'}
                </Button>
              )}
            </>
          )}
          {login && (
            <LoginSheet
              userId={u.id}
              name={u.displayName}
              username={u.username}
              email={u.username ? null : (u.email ?? '')}
              onClose={(changed) => {
                setLogin(false);
                if (changed) void q.refetch();
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}
