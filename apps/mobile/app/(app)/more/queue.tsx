import { useEffect } from 'react';
import { Alert, Text } from 'react-native';
import { Badge, Button, Card, Empty, Row, Screen } from '@/components/ui';
import { toast } from '@/components/toast';
import { discard, useQueue } from '@/lib/queue';
import { relative } from '@/lib/format';
import { font } from '@/lib/theme';

/** Everything saved offline, oldest first. Items the server refused stay here with its reason. */
export default function QueueScreen() {
  const { items, flushing, reload, flushNow } = useQueue();
  useEffect(() => {
    void reload();
  }, [reload]);
  async function retry() {
    await flushNow();
    await reload();
    const left = useQueue.getState().items;
    toast(left.length ? 'info' : 'success', left.length ? `${left.length} still waiting` : 'Everything sent');
  }
  return (
    <Screen
      title="Waiting to send"
      subtitle="Saved on this phone while offline. Sends automatically when you’re back online."
      refreshing={flushing}
      onRefresh={retry}
    >
      {items.length === 0 ? (
        <Card>
          <Empty
            icon="cloud-done-outline"
            title="Nothing waiting"
            body="Everything you saved has reached the school."
          />
        </Card>
      ) : (
        <>
          <Button icon="cloud-upload-outline" loading={flushing} onPress={retry}>
            Send now
          </Button>
          <Card>
            {items.map((i) => (
              <Row
                key={i.id}
                title={i.label}
                subtitle={
                  <Text style={i.error ? { color: '#b91c1c' } : font.small}>
                    {i.error ? `Refused: ${i.error}` : `Saved ${relative(i.createdAt)}`}
                  </Text>
                }
                right={i.error ? <Badge tone="red">Needs you</Badge> : <Badge tone="amber">Waiting</Badge>}
                onPress={
                  i.error
                    ? () =>
                        Alert.alert(
                          'Remove this item?',
                          `${i.label}\n\nThe school refused it: ${i.error}\nFix it on the web or redo it, then remove this copy.`,
                          [
                            { text: 'Keep', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => void discard(i.id).then(reload) },
                          ],
                        )
                    : undefined
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
