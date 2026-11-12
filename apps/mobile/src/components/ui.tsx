import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPKR } from '@edusaas/shared';
import { colors, font, radius, space, tones, type Tone } from '@/lib/theme';

/** Scrollable screen with pull-to-refresh and safe-area bottom padding. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  title,
  subtitle,
  right,
  padded = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  title?: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: padded ? space.lg : 0, paddingBottom: insets.bottom + 96, gap: space.lg }}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {title && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={font.h1}>{title}</Text>
            {subtitle ? <Text style={[font.small, { marginTop: 2 }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  title,
  action,
  style,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      {(title || action) && (
        <View style={styles.cardHead}>
          {title ? <Text style={font.h2}>{title}</Text> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Stat({
  tone,
  title,
  value,
  caption,
  icon,
  onPress,
}: {
  tone: Tone;
  title: string;
  value: ReactNode;
  caption?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}) {
  const t = tones[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.stat, { backgroundColor: t.bg, opacity: pressed ? 0.85 : 1 }]}
    >
      {icon && (
        <View style={styles.statIcon}>
          <Ionicons name={icon} size={20} color={t.fg} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {caption ? (
          <Text style={[font.tiny, { color: colors.muted }]} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
        <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{title}</Text>
        <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

export function Button({
  children,
  variant = 'primary',
  loading,
  icon,
  style,
  ...rest
}: PressableProps & {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'primary'
      ? colors.ink
      : variant === 'danger'
        ? colors.red
        : variant === 'secondary'
          ? colors.card
          : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : colors.text;
  return (
    <Pressable
      {...rest}
      disabled={rest.disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderColor: colors.line,
          opacity: rest.disabled ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{children}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{label}</Text>
      {children}
      {error ? (
        <Text style={{ fontSize: 12, color: colors.red }}>{error}</Text>
      ) : hint ? (
        <Text style={font.tiny}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.style]} />;
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const map = {
    slate: { bg: '#f1f5f9', fg: '#334155' },
    green: { bg: colors.greenSoft, fg: '#065f46' },
    amber: { bg: colors.amberSoft, fg: '#92400e' },
    red: { bg: colors.redSoft, fg: '#991b1b' },
    blue: { bg: colors.skySoft, fg: '#075985' },
  }[tone];
  return (
    <View
      style={{
        backgroundColor: map.bg,
        borderRadius: radius.pill,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: map.fg }}>{children}</Text>
    </View>
  );
}

export function Row({
  title,
  subtitle,
  right,
  onPress,
  left,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  left?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#f8fafc' }]}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <Text style={{ fontSize: 15, fontWeight: '500', color: colors.ink }} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={font.small} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </Pressable>
  );
}

export function Empty({
  icon = 'leaf-outline',
  title,
  body,
  action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#f1f5f9',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={22} color={colors.muted} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.ink }}>{title}</Text>
      {body ? <Text style={[font.small, { textAlign: 'center', maxWidth: 280 }]}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Money({ paisa, style }: { paisa: number; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontVariant: ['tabular-nums'], color: colors.ink }, style]}>{formatPKR(paisa)}</Text>;
}

export function Loading() {
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ backgroundColor: colors.amberSoft, borderRadius: radius.lg, padding: space.md, gap: 8 }}>
      <Text style={{ color: '#92400e' }}>{message}</Text>
      {onRetry && (
        <Button variant="secondary" onPress={onRetry}>
          Try again
        </Button>
      )}
    </View>
  );
}

export function Chip({ children, active, onPress }: { children: ReactNode; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: colors.ink, borderColor: colors.ink }]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? '#fff' : colors.text }}>{children}</Text>
    </Pressable>
  );
}

export function Hr() {
  return <View style={{ height: 1, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.lg, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.xl,
    padding: 14,
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    minHeight: 48,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: radius.md },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
});
