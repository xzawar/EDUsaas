import { View } from 'react-native';
import { Text } from '@/components/text';
import { colors } from '@/lib/theme';

/** Initials in a round tint chip: makes long lists of people easy to scan. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brand,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.deep, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}
