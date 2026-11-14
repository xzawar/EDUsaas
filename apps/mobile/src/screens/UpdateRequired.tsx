import { Linking, View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { API_URL, APP_VERSION } from '@/lib/config';
import type { Release } from '@/lib/update';
import { colors, font } from '@/lib/theme';

/** Shown instead of the app when the server no longer supports this build. Saved offline work stays on the phone. */
export function UpdateRequired({ latest }: { latest: Release | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 28, justifyContent: 'center', gap: 16 }}>
      <Text style={font.h1}>Please update EDUsaas</Text>
      <Text style={font.body}>
        This version ({APP_VERSION}) is too old to talk to your school. Download the new version and install it over
        this one. Anything waiting to send stays on this phone.
      </Text>
      <Button icon="download-outline" onPress={() => Linking.openURL(latest?.apkUrl ?? `${API_URL}/download`)}>
        Download the update
      </Button>
    </View>
  );
}
