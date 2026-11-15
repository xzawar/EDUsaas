import { Pressable, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { addDaysIso, fmtDate } from '@/lib/format';
import { colors } from '@/lib/theme';

/** Pick a day without typing: the date in words with back/forward buttons (one day per tap). */
export function DateStepper({
  value,
  onChange,
  min,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  label: string;
}) {
  const canBack = !min || value > min;
  const btn = (dir: -1 | 1, on: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${dir < 0 ? 'previous' : 'next'} day`}
      disabled={!on}
      onPress={() => onChange(addDaysIso(value, dir))}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.cardStrong : '#fff',
        opacity: on ? 1 : 0.35,
      })}
    >
      <Icon name={dir < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.ink} />
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: 999,
        padding: 4,
      }}
    >
      {btn(-1, canBack)}
      <Text style={{ flex: 1, textAlign: 'center', fontWeight: '700', color: colors.ink, fontSize: 16 }}>
        {fmtDate(value, { weekday: 'short', day: 'numeric', month: 'short' })}
      </Text>
      {btn(1, true)}
    </View>
  );
}
