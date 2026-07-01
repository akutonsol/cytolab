/**
 * Literal token values for contexts that can't read CSS variables — chiefly
 * recharts (SVG fills/strokes are computed in JS). Keep these in lockstep with
 * the CSS variables in globals.css.
 */
export const CHART = {
  primary: '#4f7df9',
  primarySoft: '#eaf0fe',
  ink: '#1a1d21', // near-black secondary series
  success: '#16a34a',
  danger: '#dc2626',
  grid: '#edeff2',
  track: '#e1e4e9',
  axis: '#9ca3af',
  barIdle: '#eceef1',
} as const;

export const COLOR = {
  primary: '#4f7df9',
  text: '#1a1d21',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  border: '#edeff2',
  borderStrong: '#e1e4e9',
  surface: '#ffffff',
  bg: '#f4f5f7',
} as const;
