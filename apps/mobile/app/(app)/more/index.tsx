import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { Badge, Button, Card, Row, Screen } from '@/components/ui';
import { moreFor } from '@/lib/nav';
import { useQueue } from '@/lib/queue';
import { useSession } from '@/lib/session';
import { APP_VERSION } from '@/lib/config';
import { ROLE_LABELS } from '@/lib/format';
import { colors, font } from '@/lib/theme';
import { useGet } from '@/lib/data';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { useUpdateCheck } from '@/lib/update';

export default function MoreScreen() {
  const me = useSession((s) => s.me)!;
  const signOut = useSession((s) => s.signOut);
  const router = useRouter();
  const queue = useQueue();
  const isPlatform = me.user.role === 'PLATFORM_OWNER' || me.user.role === 'PLATFORM_ADMIN';
  const notes = useGet<{ unread: number }>(isPlatform ? null : '/notifications');
  const update = useUpdateCheck();
  useEffect(() => {
    void queue.reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const badge = (href: string) => {
    if (href.endsWith('/queue') && queue.items.length)
      return <Badge tone={queue.items.some((i) => i.error) ? 'red' : 'amber'}>{queue.items.length}</Badge>;
    if (href.endsWith('/notifications') && notes.data?.unread) return <Badge tone="blue">{notes.data.unread}</Badge>;
    return <Ionicons name="chevron-forward" size={18} color={colors.muted} />;
  };
  return (
    <Screen title="More">
      <Card>
        <Text style={font.h2}>{me.user.displayName}</Text>
        <Text style={font.small}>
          {ROLE_LABELS[me.user.role] ?? me.user.role}
          {me.tenant ? ` · ${me.tenant.name}` : ''}
        </Text>
      </Card>
      {update.available && (
        <Card>
          <Row
            left={<Ionicons name="sparkles-outline" size={22} color={colors.accent} />}
            title={`Version ${update.available.version} is ready`}
            subtitle={update.available.notes ?? 'Tap to download and install it over this one.'}
            onPress={() => Linking.openURL(update.available!.apkUrl!)}
          />
        </Card>
      )}
      <Card style={{ paddingVertical: 4 }}>
        {moreFor(me)
          .filter((i) => !(isPlatform && i.href.endsWith('/notifications')))
          .map((i) => (
            <Row
              key={i.href}
              left={<Ionicons name={i.icon} size={22} color={colors.accent} />}
              title={i.title}
              subtitle={i.subtitle}
              right={badge(i.href)}
              onPress={() => router.push(i.href as never)}
            />
          ))}
      </Card>
      <Button
        variant="secondary"
        icon="log-out-outline"
        onPress={() =>
          queue.items.length
            ? Alert.alert(
                'Unsent items on this phone',
                `${queue.items.length} item(s) haven’t reached the school yet. Signing out deletes them from this phone.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Send first', onPress: () => router.push('/(app)/more/queue' as never) },
                  { text: 'Delete and sign out', style: 'destructive', onPress: () => void signOut() },
                ],
              )
            : Alert.alert('Sign out?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
              ])
        }
      >
        Sign out
      </Button>
      <View style={{ alignItems: 'center' }}>
        <Text style={font.tiny}>EDUsaas for Android · v{APP_VERSION}</Text>
      </View>
    </Screen>
  );
}
