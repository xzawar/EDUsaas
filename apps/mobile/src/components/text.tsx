import type { ComponentProps } from 'react';
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type TextStyle } from 'react-native';
import { colors, family } from '@/lib/theme';

/**
 * Text in the app's typeface. Android does not pick a face from `fontWeight` for embedded fonts, so this maps the
 * weight to the matching Inter file (400 → Regular, 500 → Medium, 600+ → SemiBold) unless a family is set.
 * Default colour is the body colour; titles set `colors.ink`.
 */
function faceFor(style: TextStyle): TextStyle {
  if (style.fontFamily) return {};
  const w = String(style.fontWeight ?? '400');
  const face = w === 'bold' || Number(w) >= 600 ? family.semibold : Number(w) === 500 ? family.medium : family.regular;
  return { fontFamily: face, fontWeight: 'normal' };
}

// React 19: `ref` is an ordinary prop and passes straight through.
export function Text({ style, ...props }: ComponentProps<typeof RNText>) {
  const flat: TextStyle = StyleSheet.flatten([{ color: colors.text }, style]) ?? {};
  return <RNText {...props} style={[flat, faceFor(flat)]} />;
}

export function TextInput({ style, ...props }: ComponentProps<typeof RNTextInput>) {
  const flat: TextStyle = StyleSheet.flatten([{ color: colors.ink }, style]) ?? {};
  return <RNTextInput {...props} style={[flat, faceFor(flat)]} />;
}
