import { View } from 'react-native';
import { Text } from '@/components/text';
import { Badge, Card, ErrorBox, Loading, Row, Screen } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { fmtDate } from '@/lib/format';
import { colors, font } from '@/lib/theme';

type Plan = {
  current: {
    plan: string;
    planId: string;
    status: string;
    renewsOn: string | null;
    maxStudents: number | null;
    maxStaff: number | null;
    priceMonthly: number;
  } | null;
  usage: { students: number; staff: number };
  plans: { id: string; name: string; priceMonthly: number; maxStudents: number | null; maxStaff: number | null }[];
};

const rs = (n: number) => (n === 0 ? 'Free' : `Rs ${n.toLocaleString('en-PK')}/month`);
const STATUS: Record<string, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment due',
  CANCELLED: 'Cancelled',
};

function Meter({ label, used, max }: { label: string; used: number; max: number | null }) {
  const share = max ? Math.min(1, used / max) : 0;
  return (
    <View style={{ gap: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[font.body, { color: colors.ink, fontWeight: '600' }]}>{label}</Text>
        <Text style={[font.body, { color: colors.ink, fontWeight: '700' }]}>
          {used}
          {max ? ` of ${max}` : ''}
        </Text>
      </View>
      {max ? (
        <View style={{ height: 8, borderRadius: 4, backgroundColor: '#fff', overflow: 'hidden' }}>
          <View
            style={{ width: `${share * 100}%`, height: 8, backgroundColor: share >= 0.9 ? colors.red : colors.brand }}
          />
        </View>
      ) : (
        <Text style={font.tiny}>No limit</Text>
      )}
    </View>
  );
}

/** The school's EDUsaas package: what it allows, how much is used, and the other plans on offer. */
export default function PlanScreen() {
  const q = useGet<Plan>('/plan');
  const d = q.data;
  return (
    <Screen back title="Our plan" refreshing={q.isFetching} onRefresh={q.refetch}>
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <Card>
            <Text style={font.small}>Current plan</Text>
            <Text style={font.title}>{d.current?.plan ?? 'No plan yet'}</Text>
            {d.current && (
              <>
                <Text style={font.body}>{rs(d.current.priceMonthly)}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Badge tone={d.current.status === 'ACTIVE' ? 'green' : d.current.status === 'TRIAL' ? 'blue' : 'red'}>
                    {STATUS[d.current.status] ?? d.current.status}
                  </Badge>
                  {d.current.renewsOn && <Badge>Renews {fmtDate(d.current.renewsOn)}</Badge>}
                </View>
              </>
            )}
          </Card>
          <Card title="Used">
            <Meter label="Students" used={d.usage.students} max={d.current?.maxStudents ?? null} />
            <Meter label="Staff" used={d.usage.staff} max={d.current?.maxStaff ?? null} />
          </Card>
          {d.plans.length > 0 && (
            <Card title="All plans">
              {d.plans.map((p) => (
                <Row
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.maxStudents ?? 'Any number of'} students · ${p.maxStaff ?? 'any'} staff`}
                  right={
                    p.id === d.current?.planId ? (
                      <Badge tone="green">Yours</Badge>
                    ) : (
                      <Text style={{ fontWeight: '700', color: colors.ink }}>{rs(p.priceMonthly)}</Text>
                    )
                  }
                />
              ))}
              <Text style={font.tiny}>To change plan, ask the EDUsaas team from Help.</Text>
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
