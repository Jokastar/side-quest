export const colors = {
  primary: '#6C63FF',
  primaryDark: '#4B44CC',
  secondary: '#FF6584',
  accent: '#43E97B',

  background: '#0F0F1A',
  surface: '#1A1A2E',
  card: '#16213E',
  border: '#2A2A4A',

  text: '#FFFFFF',
  textSecondary: '#A0A0C0',
  textMuted: '#606080',

  success: '#43E97B',
  warning: '#F6D365',
  error: '#FF6B6B',
  info: '#4ECDC4',

  xp: '#FFD700',
  level: '#6C63FF',

  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof colors;
