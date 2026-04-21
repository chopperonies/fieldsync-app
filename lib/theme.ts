// Theme tokens. Two curated palettes (dark / light) plus a system
// option that follows the OS setting. Components read tokens via
// useTheme() — no hard-coded hex in screens once converted.

export type ThemeName = 'dark' | 'light';
export type ThemePreference = ThemeName | 'system';

export interface Theme {
  name: ThemeName;

  // Surfaces
  bg: string;              // root background
  surface: string;         // card background (primary container)
  surfaceElevated: string; // modals / sheets
  surfaceInset: string;    // deeper (inputs on a card, tab bar bg)
  border: string;          // subtle divider
  borderStrong: string;    // focused / selected border

  // Text
  textPrimary: string;     // main body text
  textSecondary: string;   // supporting / labels
  textMuted: string;       // disabled / hints

  // Brand + status accents
  accent: string;          // primary brand color
  accentMuted: string;     // 20% alpha-ish backdrop for pills
  accentSoft: string;      // 10% alpha for hover/selected states
  accentContrast: string;  // text that sits on accent fills

  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;
  info: string;
  infoMuted: string;

  // Overlay (modal backdrop)
  overlay: string;

  // Stage palette for Service PRO workflow chips
  stageBlue: string;
  stageCyan: string;
  stageGreen: string;
  stageIndigo: string;
  stagePurple: string;
  stageAmber: string;
}

export const darkTheme: Theme = {
  name: 'dark',
  bg: '#0a0a0a',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceInset: '#0a0a0a',
  border: '#1e1e1e',
  borderStrong: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#888888',
  textMuted: '#555555',
  accent: '#0ea5e9',
  accentMuted: '#0ea5e922',
  accentSoft: '#0ea5e911',
  accentContrast: '#000000',
  success: '#4ade80',
  successMuted: '#4ade8022',
  warning: '#facc15',
  warningMuted: '#facc1522',
  danger: '#ef4444',
  dangerMuted: '#ef444422',
  info: '#3b82f6',
  infoMuted: '#3b82f622',
  overlay: 'rgba(0,0,0,0.6)',
  stageBlue: '#3b82f6',
  stageCyan: '#0ea5e9',
  stageGreen: '#4ade80',
  stageIndigo: '#6366f1',
  stagePurple: '#a78bfa',
  stageAmber: '#f59e0b',
};

export const lightTheme: Theme = {
  name: 'light',
  bg: '#ffffff',
  surface: '#f8fafc',
  surfaceElevated: '#ffffff',
  surfaceInset: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  // Jobber-style forest green accent to match the reference screenshots.
  accent: '#15803d',
  accentMuted: '#15803d22',
  accentSoft: '#15803d11',
  accentContrast: '#ffffff',
  success: '#16a34a',
  successMuted: '#16a34a22',
  warning: '#d97706',
  warningMuted: '#d9770622',
  danger: '#dc2626',
  dangerMuted: '#dc262622',
  info: '#2563eb',
  infoMuted: '#2563eb22',
  overlay: 'rgba(15,23,42,0.5)',
  stageBlue: '#2563eb',
  stageCyan: '#0891b2',
  stageGreen: '#16a34a',
  stageIndigo: '#4f46e5',
  stagePurple: '#7c3aed',
  stageAmber: '#d97706',
};

export function resolveTheme(pref: ThemePreference, systemScheme: 'light' | 'dark' | null): Theme {
  const name: ThemeName =
    pref === 'system'
      ? (systemScheme === 'light' ? 'light' : 'dark')
      : pref;
  return name === 'light' ? lightTheme : darkTheme;
}
