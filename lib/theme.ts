// Three curated themes: two light + one refined dark. Users pick via
// Appearance in Settings. 'system' resolves to professional (OS light)
// or midnight (OS dark).

export type ThemeName = 'professional' | 'soft' | 'midnight';
export type ThemePreference = ThemeName | 'system';

export interface Theme {
  name: ThemeName;
  label: string;
  tagline: string;
  isDark: boolean;

  // Surfaces
  bg: string;              // root background
  surface: string;         // card background
  surfaceElevated: string; // modals / sheets
  surfaceInset: string;    // inputs, tab bar inset
  border: string;          // subtle divider
  borderStrong: string;    // focused / selected border

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Brand + status accents
  accent: string;
  accentMuted: string;     // alpha-mixed background for pills
  accentSoft: string;      // subtler alpha
  accentContrast: string;  // text on accent fills

  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;

  overlay: string;         // modal backdrop

  // Workflow stage palette
  stageBlue: string;
  stageCyan: string;
  stageGreen: string;
  stageIndigo: string;
  stagePurple: string;
  stageAmber: string;
}

// Professional — refined off-white + teal. Business tool look.
export const professionalTheme: Theme = {
  name: 'professional',
  label: 'Professional',
  tagline: 'Warm off-white, deep teal. Business-ready.',
  isDark: false,
  bg: '#fafafa',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceInset: '#f4f4f5',
  border: '#e4e4e7',
  borderStrong: '#d4d4d8',
  textPrimary: '#18181b',
  textSecondary: '#52525b',
  textMuted: '#a1a1aa',
  accent: '#0f766e',           // teal-700
  accentMuted: '#0f766e22',
  accentSoft: '#0f766e0f',
  accentContrast: '#ffffff',
  success: '#15803d',
  successMuted: '#15803d1a',
  warning: '#b45309',
  warningMuted: '#b453091a',
  danger: '#b91c1c',
  dangerMuted: '#b91c1c1a',
  info: '#1d4ed8',
  infoMuted: '#1d4ed81a',
  overlay: 'rgba(24,24,27,0.45)',
  stageBlue: '#1d4ed8',
  stageCyan: '#0e7490',
  stageGreen: '#15803d',
  stageIndigo: '#4338ca',
  stagePurple: '#7e22ce',
  stageAmber: '#b45309',
};

// Soft — airy mint/sage. Near-white bg, very subtle mint borders,
// bright mint-teal accent, deep forest text. Inspired by plant/nature
// apps — feels calm, light, organic. Clearly distinct from Professional
// (cool corporate) and Midnight (dark).
export const softTheme: Theme = {
  name: 'soft',
  label: 'Soft',
  tagline: 'Airy mint and sage. Calm, organic, light.',
  isDark: false,
  bg: '#f6faf8',               // near-white with faintest mint cast
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceInset: '#eef5f1',     // light mint inset
  border: '#dbeae3',           // subtle mint border
  borderStrong: '#5ec9b8',
  textPrimary: '#0c2e26',      // deep forest green-black (not neutral)
  textSecondary: '#4e6b63',    // sage gray
  textMuted: '#9cada6',        // pale sage
  accent: '#14b8a6',           // teal-500 — bright mint, distinct from Professional
  accentMuted: '#14b8a620',
  accentSoft: '#14b8a60d',
  accentContrast: '#ffffff',
  success: '#15803d',          // deeper emerald so it's distinct from accent mint
  successMuted: '#15803d1a',
  warning: '#c2410c',          // burnt orange — warm contrast to cool mint
  warningMuted: '#c2410c1a',
  danger: '#be123c',           // rose — readable on mint bg
  dangerMuted: '#be123c1a',
  info: '#1d4ed8',
  infoMuted: '#1d4ed81a',
  overlay: 'rgba(12,46,38,0.4)',
  stageBlue: '#1d4ed8',
  stageCyan: '#0891b2',
  stageGreen: '#15803d',
  stageIndigo: '#4338ca',
  stagePurple: '#7e22ce',
  stageAmber: '#c2410c',
};

// Midnight — slate-navy dark (not pure black) + bright cyan accent.
export const midnightTheme: Theme = {
  name: 'midnight',
  label: 'Midnight',
  tagline: 'Rich slate navy, bright cyan. Kind to eyes at night.',
  isDark: true,
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceElevated: '#1e293b',
  surfaceInset: '#0f172a',
  border: '#334155',
  borderStrong: '#475569',
  textPrimary: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textMuted: '#64748b',
  accent: '#22d3ee',           // cyan-400
  accentMuted: '#22d3ee22',
  accentSoft: '#22d3ee11',
  accentContrast: '#0f172a',
  success: '#34d399',
  successMuted: '#34d39922',
  warning: '#fbbf24',
  warningMuted: '#fbbf2422',
  danger: '#f87171',
  dangerMuted: '#f8717122',
  info: '#60a5fa',
  infoMuted: '#60a5fa22',
  overlay: 'rgba(0,0,0,0.6)',
  stageBlue: '#60a5fa',
  stageCyan: '#22d3ee',
  stageGreen: '#34d399',
  stageIndigo: '#818cf8',
  stagePurple: '#c084fc',
  stageAmber: '#fbbf24',
};

export const allThemes: Theme[] = [professionalTheme, softTheme, midnightTheme];

export function resolveTheme(pref: ThemePreference, systemScheme: 'light' | 'dark' | null): Theme {
  if (pref === 'system') {
    return systemScheme === 'dark' ? midnightTheme : professionalTheme;
  }
  if (pref === 'professional') return professionalTheme;
  if (pref === 'soft') return softTheme;
  return midnightTheme;
}
