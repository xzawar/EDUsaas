import { Linking } from 'react-native';
import { Text } from '@/components/text';
import { Card, Row, Screen } from '@/components/ui';
import { API_URL, APP_VERSION } from '@/lib/config';
import { font } from '@/lib/theme';
import { BrandMark } from '@/screens/BrandMark';

/** About the app: version, and the privacy policy, terms and account deletion pages (opened in the browser). */
export default function AboutScreen() {
  const open = (path: string) => void Linking.openURL(`${API_URL}${path}`);
  return (
    <Screen back title="About">
      <Card>
        <BrandMark size={44} />
        <Text style={font.title}>EDUsaas</Text>
        <Text style={font.small}>Version {APP_VERSION}</Text>
      </Card>
      <Card>
        <Row title="Privacy policy" onPress={() => open('/privacy')} />
        <Row title="Terms of use" onPress={() => open('/terms')} />
        <Row title="Delete my account" subtitle="How to ask for your account to be removed" onPress={() => open('/delete-account')} />
      </Card>
    </Screen>
  );
}
