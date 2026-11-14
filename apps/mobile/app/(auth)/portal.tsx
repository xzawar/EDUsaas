import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { Text } from '@/components/text';
import { BrandMark } from '@/screens/BrandMark';
import { colors, family, space } from '@/lib/theme';

/**
 * First screen, the app's one "brand moment": deep canvas, a heavy headline, and one loud choice. Most people are
 * students and parents, so that door is the primary button; staff and the EDUsaas team are quieter (decision D1).
 */
export default function PortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (portal: string) => router.push({ pathname: '/(auth)/login', params: { portal } });
  return (
    <View
      style={{ flex: 1, backgroundColor: colors.deep, paddingHorizontal: space.xl, paddingTop: insets.top + space.xl }}
    >
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <BrandMark size={36} />
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600' }}>EDUsaas</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text
          style={{ fontFamily: family.display, fontSize: 56, lineHeight: 50, color: colors.brand, letterSpacing: -0.5 }}
        >
          School,{'\n'}made{'\n'}simple.
        </Text>
        <Text style={{ marginTop: space.xl, fontSize: 17, lineHeight: 25, color: 'rgba(255,255,255,0.8)' }}>
          Attendance, marks, fees and the timetable, for students, parents, teachers and the school office.
        </Text>
      </View>
      <View style={{ gap: space.md, paddingBottom: insets.bottom + space.xl }}>
        <Button onPress={() => go('student')}>Student or parent</Button>
        <Button variant="secondary" onPress={() => go('staff')} style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Staff</Text>
        </Button>
        <Pressable onPress={() => go('platform')} hitSlop={8} style={{ alignSelf: 'center', padding: space.sm }}>
          <Text
            style={{
              color: 'rgba(255,255,255,0.75)',
              fontSize: 14,
              fontWeight: '600',
              textDecorationLine: 'underline',
            }}
          >
            EDUsaas team sign in
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
