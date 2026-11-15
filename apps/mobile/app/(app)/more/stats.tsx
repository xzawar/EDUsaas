import { View } from 'react-native';
import { Text } from '@/components/text';
import { Card, ErrorBox, Loading, Row, Screen, Stat } from '@/components/ui';
import { errorText, useGet } from '@/lib/data';
import { ROLE_LABELS, relative } from '@/lib/format';
import { colors, font } from '@/lib/theme';

type Stats = {
  checkedAt: string;
  usage: {
    activeNow: number;
    activeSessions: number;
    loginsToday: number;
    loginsWeek: number;
    appInstalls: number;
    appVersions: { version: string; count: number }[];
  };
  people: { students: number; byRole: Record<string, number> };
  schools: Record<string, number>;
  server: {
    load: { one: number; five: number; fifteen: number };
    cpus: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    uptimeHours: number;
  };
  database: { latencyMs: number; sizeMb: number };
  jobs: Record<string, number>;
};

/** How the whole app is doing: who's using it, and how hard the server and database are working. */
export default function StatsScreen() {
  // Refreshes every 30 s while open.
  const q = useGet<Stats>('/platform/stats', { refetchInterval: 30_000 });
  const d = q.data;
  const loadPct = d ? Math.round((d.server.load.one / d.server.cpus) * 100) : 0;
  const busy = loadPct >= 80;
  return (
    <Screen
      back
      title="App health"
      subtitle={d ? `Checked ${relative(d.checkedAt)}` : undefined}
      refreshing={q.isFetching}
      onRefresh={q.refetch}
    >
      {q.isError && !d && <ErrorBox message={errorText(q.error)} onRetry={q.refetch} />}
      {!d && q.isLoading && <Loading />}
      {d && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <Stat
              tone="violet"
              icon="pulse-outline"
              title="Using it now"
              value={d.usage.activeNow}
              caption="last 15 minutes"
            />
            <Stat
              tone="mint"
              icon="people-outline"
              title="Signed in today"
              value={d.usage.loginsToday}
              caption={`${d.usage.loginsWeek} this week`}
            />
            <Stat
              tone="amber"
              icon="speedometer-outline"
              title="Server load"
              value={`${loadPct}%`}
              caption={busy ? 'Busy' : 'Normal'}
            />
            <Stat
              tone="sky"
              icon="server-outline"
              title="Database"
              value={`${d.database.latencyMs} ms`}
              caption={`${d.database.sizeMb} MB`}
            />
          </View>
          <Card title="Server">
            <Row title="Memory" right={`${d.server.memoryUsedMb} MB used`} />
            <Row
              title="Load (1 · 5 · 15 min)"
              right={`${d.server.load.one.toFixed(2)} · ${d.server.load.five.toFixed(2)} · ${d.server.load.fifteen.toFixed(2)}`}
            />
            <Row title="Up for" right={`${d.server.uptimeHours} h`} />
            <Row
              title="Background jobs"
              right={
                Object.entries(d.jobs)
                  .map(([k, v]) => `${v} ${k.toLowerCase()}`)
                  .join(' · ') || 'None'
              }
            />
          </Card>
          <Card title="Schools">
            <Row title="Active" right={String(d.schools.ACTIVE ?? 0)} />
            <Row title="On trial" right={String(d.schools.TRIAL ?? 0)} />
            <Row title="Suspended" right={String(d.schools.SUSPENDED ?? 0)} />
          </Card>
          <Card title="People">
            <Row title="Students" right={d.people.students.toLocaleString()} />
            {Object.entries(d.people.byRole)
              .filter(([r]) => r !== 'STUDENT')
              .sort((a, b) => b[1] - a[1])
              .map(([r, n]) => (
                <Row key={r} title={ROLE_LABELS[r] ?? r} right={String(n)} />
              ))}
          </Card>
          <Card title="Phones">
            <Row title="App installed on" right={`${d.usage.appInstalls} phones`} />
            {d.usage.appVersions.slice(0, 4).map((v) => (
              <Row key={v.version} title={`Version ${v.version}`} right={String(v.count)} />
            ))}
            <Text style={[font.tiny, { color: colors.muted }]}>
              {d.usage.activeSessions} signed-in sessions in total.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}
