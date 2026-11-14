/**
 * EDUsaas design tokens for the app: the same system as the website (src/app/globals.css). Calm and flat: white
 * screens, tinted cards, no shadows, one loud action per screen, sentiment carried by text/icon colour only.
 *
 * Brand primitives: brand #A99BFF (the one primary button per screen), deep #1C1259 (text on brand, links,
 * controls, the brand-moment canvas), ink #0F0E14 (titles). Everything else derives from them.
 */
export const colors = {
  // surfaces
  bg: '#ffffff', // screen
  card: '#edecf2', // background.neutral: deep at 8% on white
  cardStrong: '#e2e0ea',
  line: '#e2e1e5', // border.neutral: ink at 12%
  // content
  ink: '#0f0e14', // titles, important
  text: '#4a4752', // body copy (secondary)
  muted: '#6c6975', // tertiary: captions, meta
  faint: '#a6a4ad', // disabled, placeholders
  // brand
  brand: '#a99bff', // the accent fill
  deep: '#1c1259', // text on brand, links, controls
  deep2: '#4b3bb0',
  accent: '#1c1259', // links and accented icons (kept for callers; on white the brand fill is too light for text)
  accentSoft: '#edecf2',
  // sentiment: foreground only, the fills all collapse to the neutral tint
  green: '#1e6b3a',
  greenSoft: '#edecf2',
  red: '#b0261b',
  redSoft: '#edecf2',
  amber: '#edc843', // icons and dots only, never text
  amberSoft: '#edecf2',
  sky: '#4b3bb0',
  skySoft: '#edecf2',
  pink: '#1c1259',
  pinkSoft: '#edecf2',
  mint: '#1c1259',
  mintSoft: '#edecf2',
  scrim: 'rgba(15,14,20,0.4)',
};

/** Tile tones are kept as names (screens vary tiles) but all render the same quiet surface. */
const neutral = { bg: colors.card, fg: colors.deep };
export const tones = { violet: neutral, pink: neutral, sky: neutral, mint: neutral, amber: neutral } as const;
export type Tone = keyof typeof tones;

/** Spacing by relationship: text→text 8, text→component 16, component→component 16, content→button 24, sections 32. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 12, lg: 16, xl: 24, sheet: 32, pill: 999 };

/** Font families (embedded in the APK by the expo-font config plugin). Text picks the face from fontWeight. */
export const family = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  display: 'ArchivoBlack_400Regular',
};

/** Type ramp. Tracking follows Inter's dynamic metrics: -0.0223 + 0.185·e^(-0.1745·px), in px here. */
export const font = {
  display: { fontFamily: family.display, fontSize: 44, lineHeight: 40, color: colors.ink, letterSpacing: -0.4 },
  h1: { fontSize: 30, lineHeight: 35, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.64 },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.25 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 24, color: colors.text, letterSpacing: -0.18 },
  small: { fontSize: 14, lineHeight: 21, color: colors.text, letterSpacing: -0.08 },
  tiny: { fontSize: 13, lineHeight: 18, color: colors.muted },
  mono: { fontFamily: 'monospace' as const, fontSize: 13, color: colors.muted },
};
