import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PORTALS } from '@edusaas/shared';
import { colors, font, radius, space } from '@/lib/theme';

const ICON = { student: 'school-outline', staff: 'people-outline', platform: 'planet-outline' } as const;

/** First screen: which door are you coming in through? (decision D1: separate portals). */
export default function PortalScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{ flex: 1, padding: space.xl, paddingTop: insets.top + 56, gap: space.lg, backgroundColor: colors.bg }}
    >
      <View style={{ alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>E</Text>
        </View>
        <Text style={font.h1}>EDUsaas</Text>
        <Text style={font.small}>Sign in to your school</Text>
      </View>
      {PORTALS.map((p) => (
        <Pressable
          key={p.slug}
          onPress={() => router.push({ pathname: '/(auth)/login', params: { portal: p.slug } })}
          style={({ pressed }) => ({
            backgroundColor: colors.card,
            borderRadius: radius.xl,
            padding: space.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={ICON[p.slug]} size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.ink }}>{p.title}</Text>
            <Text style={font.small}>{p.blurb}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.faint} />
        </Pressable>
      ))}
      <Text style={[font.tiny, { textAlign: 'center', marginTop: 'auto', marginBottom: insets.bottom }]}>
        Each school’s data is kept separate.
      </Text>
    </View>
  );
}
