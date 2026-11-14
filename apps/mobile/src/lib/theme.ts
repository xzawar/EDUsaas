/** Same pastel palette and type scale as the web app, as plain values for StyleSheet. */
export const colors = {
  bg: '#f4f4f8',
  card: '#ffffff',
  ink: '#0f172a',
  text: '#1e293b',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  accent: '#6d5dfc',
  accentSoft: '#ece9ff',
  green: '#059669',
  greenSoft: '#d1fae5',
  red: '#dc2626',
  redSoft: '#fee2e2',
  amber: '#d97706',
  amberSoft: '#fef3c7',
  sky: '#0284c7',
  skySoft: '#e0f2fe',
  pink: '#db2777',
  pinkSoft: '#fce7f3',
  mint: '#0f766e',
  mintSoft: '#ccfbf1',
};

export const tones = {
  violet: { bg: '#ece9ff', fg: '#4c3fd6' },
  pink: { bg: '#fce7f3', fg: '#be185d' },
  sky: { bg: '#e0f2fe', fg: '#0369a1' },
  mint: { bg: '#ccfbf1', fg: '#0f766e' },
  amber: { bg: '#fef3c7', fg: '#b45309' },
} as const;
export type Tone = keyof typeof tones;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { md: 12, lg: 16, xl: 20, pill: 999 };
export const font = {
  h1: { fontSize: 26, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '600' as const, color: colors.ink },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.muted },
  tiny: { fontSize: 11, color: colors.faint },
  mono: { fontFamily: 'monospace' as const, fontSize: 13, color: colors.muted },
};
