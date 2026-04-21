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

// Soft — neumorphism-inspired cool lavender-gray. Background has a
// distinctive cool cast (not neutral white), cards sit a shade
// lighter to create a subtle lifted feel, periwinkle accent pops
// against the cool base. Deep navy text reinforces the cool mood.
export const softTheme: Theme = {
  name: 'soft',
  label: 'Soft',
  tagline: 'Cool lavender-gray + periwinkle accent. Quiet and modern.',
  isDark: false,
  bg: '#e8ebf2',               // cool light gray-lavender — the feature
  surface: '#f3f5f9',           // slightly lighter for lifted cards
  surfaceElevated: '#ffffff',  // pure white for modals
  surfaceInset: '#dee2eb',     // deeper inset for inputs
  border: '#d4d9e3',           // very subtle cool border
  borderStrong: '#9fa8ba',
  textPrimary: '#2a2e4a',      // deep navy — not pure black, warms the cool
  textSecondary: '#6c7289',    // blue-gray secondary
  textMuted: '#9ea3b5',        // pale blue-gray
  accent: '#6366f1',           // indigo-500 periwinkle — soft but punchy
  accentMuted: '#6366f122',
  accentSoft: '#6366f10f',
  accentContrast: '#ffffff',
  success: '#059669',          // emerald — reads well against cool bg
  successMuted: '#0596691a',
  warning: '#d97706',          // amber
  warningMuted: '#d977061a',
  danger: '#dc2626',           // red
  dangerMuted: '#dc26261a',
  info: '#2563eb',
  infoMuted: '#2563eb1a',
  overlay: 'rgba(42,46,74,0.45)',
  stageBlue: '#2563eb',
  stageCyan: '#0891b2',
  stageGreen: '#059669',
  stageIndigo: '#4f46e5',
  stagePurple: '#7c3aed',
  stageAmber: '#d97706',
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
