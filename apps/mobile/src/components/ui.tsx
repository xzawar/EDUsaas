import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPKR } from '@edusaas/shared';
import { Text, TextInput } from '@/components/text';
import { colors, font, radius, space, tones, type Tone } from '@/lib/theme';

/**
 * The app's building blocks, in the same calm system as the website: white screens, tinted flat cards (no shadows),
 * pill buttons with one loud action per screen, and colour used only for meaning.
 */

/** Scrollable screen: a large title (with the status-bar inset), pull-to-refresh, and room above the tab bar. */
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
      contentContainerStyle={{
        padding: padded ? space.lg : 0,
        paddingTop: (title ? insets.top + space.xl : 0) + (padded ? space.lg : 0),
        paddingBottom: insets.bottom + 96,
        gap: space.lg,
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.deep}
            colors={[colors.deep]}
          />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
    >
      {title && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: space.md,
            marginBottom: space.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={font.h1}>{title}</Text>
            {subtitle ? <Text style={[font.body, { marginTop: space.sm }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

/** Flat tinted card, radius 16. */
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

/** A number tile: icon in a white disc, a label, then the value large and dark. Tappable when it leads somewhere. */
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
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.stat, { backgroundColor: pressed ? colors.cardStrong : t.bg }]}
    >
      {icon && (
        <View style={styles.statIcon}>
          <Ionicons name={icon} size={20} color={t.fg} />
        </View>
      )}
      <Text style={[font.small, { marginTop: space.md }]} numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={{
          fontSize: 20,
          lineHeight: 26,
          fontWeight: '600',
          color: colors.ink,
          letterSpacing: -0.3,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      {caption ? (
        <Text style={[font.tiny, { marginTop: 2 }]} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Pill button. `primary` is the screen's one loud action (brand fill, deep text); `secondary` a quiet tinted fill;
 * `ghost` a link-coloured text button; `danger` only for destructive actions.
 */
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
      ? colors.brand
      : variant === 'danger'
        ? colors.red
        : variant === 'secondary'
          ? colors.cardStrong
          : 'transparent';
  const fg =
    variant === 'primary'
      ? colors.deep
      : variant === 'danger'
        ? '#fff'
        : variant === 'ghost'
          ? colors.deep
          : colors.ink;
  const disabled = !!rest.disabled || !!loading;
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: rest.disabled ? 0.45 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { minHeight: 44, paddingHorizontal: 12 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text
        style={{
          color: fg,
          fontWeight: '600',
          fontSize: 16,
          letterSpacing: -0.18,
          textDecorationLine: variant === 'ghost' ? 'underline' : 'none',
        }}
      >
        {children}
      </Text>
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
    <View style={{ gap: space.sm }}>
      <Text style={font.small}>{label}</Text>
      {children}
      {error ? (
        <Text style={{ fontSize: 13, color: colors.red }}>{error}</Text>
      ) : hint ? (
        <Text style={font.tiny}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.faint} {...props} style={[styles.input, props.style]} />;
}

/** Status pill: neutral fill, the tone colours the text (and a yellow dot for "waiting"). */
export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const fg = { slate: colors.ink, green: colors.green, amber: colors.text, red: colors.red, blue: colors.deep }[tone];
  return (
    <View style={styles.badge}>
      {tone === 'amber' && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />}
      <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: '600', color: fg }}>{children}</Text>
    </View>
  );
}

/** List row: flush (rows bring their own padding), title SemiBold, subtitle in body colour, optional trailing item. */
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
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(255,255,255,0.7)' }]}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' || typeof title === 'number' ? (
          <Text
            style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink, letterSpacing: -0.18 }}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : (
          title
        )}
        {subtitle ? (
          typeof subtitle === 'string' || typeof subtitle === 'number' ? (
            <Text style={[font.small, { marginTop: 2 }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {typeof right === 'string' || typeof right === 'number' ? <Text style={font.small}>{right}</Text> : right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={20} color={colors.muted} /> : null}
    </Pressable>
  );
}

/** Empty state: a picture, what will show here, and the one thing to do next. */
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
    <View style={{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg, gap: space.sm }}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.deep} />
      </View>
      <Text style={[font.h2, { textAlign: 'center', marginTop: space.sm }]}>{title}</Text>
      {body ? <Text style={[font.small, { textAlign: 'center', maxWidth: 300 }]}>{body}</Text> : null}
      {action ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Money({ paisa, style }: { paisa: number; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontVariant: ['tabular-nums'], color: colors.ink }, style]}>{formatPKR(paisa)}</Text>;
}

export function Loading() {
  return (
    <View style={{ padding: 48, alignItems: 'center' }}>
      <ActivityIndicator color={colors.deep} />
    </View>
  );
}

/** Errors give the cause and a next step: neutral card, red icon, and "Try again". */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[styles.card, { gap: space.md }]}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <Ionicons name="alert-circle" size={22} color={colors.red} />
        <Text style={[font.body, { flex: 1, color: colors.ink }]}>{message}</Text>
      </View>
      {onRetry && (
        <Button variant="secondary" icon="refresh-outline" onPress={onRetry}>
          Try again
        </Button>
      )}
    </View>
  );
}

/** Filter chip: the selected one is ink, the rest sit on the tint. */
export function Chip({ children, active, onPress }: { children: ReactNode; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active && { backgroundColor: colors.ink }]}
    >
      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? '#fff' : colors.ink }}>{children}</Text>
    </Pressable>
  );
}

export function Hr() {
  return <View style={{ height: 1, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  stat: {
    borderRadius: radius.lg,
    padding: space.lg,
    minWidth: '47%',
    flexGrow: 1,
    flexBasis: '47%',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    minHeight: 52,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 52,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.cardStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
});
