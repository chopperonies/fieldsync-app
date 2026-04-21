// Three curated themes: two light + one refined dark. Users pick via
// Appearance in Settings. 'system' resolves to professional (OS light)
// or midnight (OS dark).

export type ThemeName = 'professional' | 'soft' | 'midnight' | 'tech';
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

// Midnight — warm charcoal neumorphism + peach accent. Inspired by the
// dark-neumorphism "power of teams" reference. Neutral warm-dark base
// (not blue-tinted), surfaces barely lifted from bg for a monolithic
// feel, warm peach accent pops against the dark.
export const midnightTheme: Theme = {
  name: 'midnight',
  label: 'Midnight',
  tagline: 'Warm charcoal + peach accent. Sophisticated dark.',
  isDark: true,
  bg: '#1c1c20',               // warm neutral dark charcoal
  surface: '#26272b',          // subtle lift from bg
  surfaceElevated: '#2d2e33',  // modals
  surfaceInset: '#16171a',     // deeper inset for inputs
  border: '#2f2f35',           // very subtle
  borderStrong: '#4a4a52',
  textPrimary: '#f5f5f5',      // off-white (not pure)
  textSecondary: '#a8a8ac',    // neutral mid gray
  textMuted: '#6e6e72',
  accent: '#f2b37c',           // warm peach / apricot
  accentMuted: '#f2b37c22',
  accentSoft: '#f2b37c11',
  accentContrast: '#1c1c20',   // dark text on peach fills
  success: '#86efac',          // soft green
  successMuted: '#86efac22',
  warning: '#fcd34d',          // soft amber
  warningMuted: '#fcd34d22',
  danger: '#fca5a5',           // soft coral-red
  dangerMuted: '#fca5a522',
  info: '#93c5fd',             // soft blue
  infoMuted: '#93c5fd22',
  overlay: 'rgba(0,0,0,0.65)',
  stageBlue: '#93c5fd',
  stageCyan: '#67e8f9',
  stageGreen: '#86efac',
  stageIndigo: '#a5b4fc',
  stagePurple: '#d8b4fe',
  stageAmber: '#fcd34d',
};

// Tech — deep navy-blue base with bright cyan accent + vibrant status
// colors. Inspired by a notification-widget reference — "Color My
// Life". Tech console feel without being a pure dark theme.
export const techTheme: Theme = {
  name: 'tech',
  label: 'Tech',
  tagline: 'Deep navy + bright cyan + vibrant status colors.',
  isDark: true,
  bg: '#1a2332',               // deep navy blue-gray
  surface: '#2d3748',          // lifted card navy
  surfaceElevated: '#374151',  // modals
  surfaceInset: '#111827',     // inputs
  border: '#3d4a5c',           // visible but subtle
  borderStrong: '#5b6b80',
  textPrimary: '#f9fafb',      // near-white
  textSecondary: '#cbd5e1',    // light slate
  textMuted: '#94a3b8',
  accent: '#0ea5e9',           // sky-500 — bright cyan
  accentMuted: '#0ea5e922',
  accentSoft: '#0ea5e911',
  accentContrast: '#0f172a',
  success: '#22c55e',          // vibrant green
  successMuted: '#22c55e22',
  warning: '#eab308',          // vibrant yellow
  warningMuted: '#eab30822',
  danger: '#ef4444',           // vibrant red
  dangerMuted: '#ef444422',
  info: '#3b82f6',
  infoMuted: '#3b82f622',
  overlay: 'rgba(15,23,42,0.65)',
  stageBlue: '#3b82f6',
  stageCyan: '#06b6d4',
  stageGreen: '#22c55e',
  stageIndigo: '#6366f1',
  stagePurple: '#a855f7',
  stageAmber: '#eab308',
};

export const allThemes: Theme[] = [professionalTheme, softTheme, midnightTheme, techTheme];

export function resolveTheme(pref: ThemePreference, systemScheme: 'light' | 'dark' | null): Theme {
  if (pref === 'system') {
    return systemScheme === 'dark' ? midnightTheme : professionalTheme;
  }
  if (pref === 'professional') return professionalTheme;
  if (pref === 'soft') return softTheme;
  if (pref === 'tech') return techTheme;
  return midnightTheme;
}
