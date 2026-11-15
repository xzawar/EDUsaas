import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { toast } from '@/components/toast';
import { Badge, Button, Card, Chip, ErrorBox, Field, Input, Loading, Row, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { errorText, useGet, useInvalidate } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { colors, font } from '@/lib/theme';
import { SCHOOL_STATUS } from './index';

type List = {
  items: {
    id: string;
    name: string;
    prefix: string;
    city: string | null;
    status: string;
    userCount: number;
    createdAt: string;
  }[];
};
type Sub = {
  subscription: { planId: string; status: string; renewsOn: string | null; plan: { name: string } } | null;
  usage: { students: number; staff: number };
};
type Plans = { items: { id: string; name: string; priceMonthly: number; active: boolean }[] };
const SUB = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;
const SUB_LABEL: Record<string, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Paid',
  PAST_DUE: 'Payment due',
  CANCELLED: 'Cancelled',
};

/** One school: its package, and the switches — suspend, bring back, or delete it with all its data. */
export default function SchoolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useSession((s) => s.me)!;
  const router = useRouter();
  const invalidate = useInvalidate();
  const owner = me.user.role === 'PLATFORM_OWNER';
  const plansAllowed = me.permissions.includes('platform.plans.manage');
  // The list endpoint carries every field shown here; reuse its cache.
  const list = useGet<List>('/platform/tenants?limit=50');
  const t = list.data?.items.find((x) => x.id === id);
  const sub = useGet<Sub>(plansAllowed ? `/platform/tenants/${id}/subscription` : null);
  const plans = useGet<Plans>(plansAllowed ? '/platform/plans' : null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [subStatus, setSubStatus] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const current = sub.data?.subscription;
  const chosenPlan = planId ?? current?.planId ?? null;
  const chosenStatus = subStatus ?? current?.status ?? 'TRIAL';
  const planChanged = !!chosenPlan && (chosenPlan !== current?.planId || chosenStatus !== current?.status);

  async function call(key: string, path: string, method: string, body: object, ok: string) {
    setBusy(key);
    const r = await api(path, { method: method as 'POST', body }).catch(() => null);
    setBusy(null);
    if (!r) return false;
    if (!r.ok) {
      toast('error', r.error.message);
      return false;
    }
    toast('success', ok);
    invalidate('/platform');
    return true;
  }

  return (
    <Screen
      back
      title={t?.name ?? 'School'}
      subtitle={t ? `${t.prefix}${t.city ? ` · ${t.city}` : ''}` : undefined}
      refreshing={list.isFetching}
      onRefresh={list.refetch}
    >
      {list.isError && !t && <ErrorBox message={errorText(list.error)} onRetry={list.refetch} />}
      {!t && list.isLoading && <Loading />}
      {t && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Badge tone={SCHOOL_STATUS[t.status]?.tone ?? 'blue'}>{SCHOOL_STATUS[t.status]?.label ?? t.status}</Badge>
            <Badge>Since {fmtDate(t.createdAt.slice(0, 10), { month: 'short', year: 'numeric' })}</Badge>
          </View>
          <Card>
            <Row title="Accounts" right={String(t.userCount)} />
            {sub.data && <Row title="Students" right={String(sub.data.usage.students)} />}
            {sub.data && <Row title="Staff" right={String(sub.data.usage.staff)} />}
          </Card>
          {plansAllowed && (
            <Card title="Package">
              {!plans.data ? (
                <Loading />
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {plans.data.items
                      .filter((p) => p.active || p.id === current?.planId)
                      .map((p) => (
                        <Chip key={p.id} active={chosenPlan === p.id} onPress={() => setPlanId(p.id)}>
                          {p.name}
                        </Chip>
                      ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {SUB.map((s) => (
                      <Chip key={s} active={chosenStatus === s} onPress={() => setSubStatus(s)}>
                        {SUB_LABEL[s]}
                      </Chip>
                    ))}
                  </View>
                  <Button
                    variant="secondary"
                    disabled={!planChanged}
                    loading={busy === 'plan'}
                    onPress={async () => {
                      if (
                        await call(
                          'plan',
                          `/platform/tenants/${t.id}/subscription`,
                          'PUT',
                          {
                            planId: chosenPlan,
                            status: chosenStatus,
                            renewsOn: current?.renewsOn?.slice(0, 10) ?? null,
                          },
                          'Package saved',
                        )
                      ) {
                        setPlanId(null);
                        setSubStatus(null);
                        void sub.refetch();
                      }
                    }}
                  >
                    Save package
                  </Button>
                </>
              )}
            </Card>
          )}
          {me.permissions.includes('platform.tenants.manage') && (
            <>
              {t.status === 'SUSPENDED' ? (
                <Button
                  loading={busy === 'status'}
                  onPress={() =>
                    call('status', `/platform/tenants/${t.id}`, 'PATCH', { status: 'ACTIVE' }, 'School is back on')
                  }
                >
                  Bring the school back
                </Button>
              ) : (
                <Button
                  variant="danger"
                  loading={busy === 'status'}
                  onPress={() =>
                    call(
                      'status',
                      `/platform/tenants/${t.id}`,
                      'PATCH',
                      { status: 'SUSPENDED' },
                      'Suspended. Everyone is signed out.',
                    )
                  }
                >
                  Suspend school
                </Button>
              )}
              {owner && t.status === 'SUSPENDED' && !deleting && (
                <Button variant="ghost" onPress={() => setDeleting(true)}>
                  Delete school and all its data
                </Button>
              )}
              {owner && deleting && (
                <Card>
                  <Text style={[font.body, { color: colors.red, fontWeight: '700' }]}>This can’t be undone.</Text>
                  <Text style={font.small}>
                    Every account, student, mark, bill and file of {t.name} is deleted. Type “{t.prefix}” to confirm.
                  </Text>
                  <Field label="School prefix">
                    <Input value={confirm} onChangeText={setConfirm} autoCapitalize="none" autoCorrect={false} />
                  </Field>
                  <Button
                    variant="danger"
                    disabled={confirm.trim().toLowerCase() !== t.prefix}
                    loading={busy === 'delete'}
                    onPress={async () => {
                      if (
                        await call(
                          'delete',
                          `/platform/tenants/${t.id}`,
                          'DELETE',
                          { confirmPrefix: confirm.trim() },
                          `${t.name} deleted`,
                        )
                      )
                        router.back();
                    }}
                  >
                    Delete forever
                  </Button>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
