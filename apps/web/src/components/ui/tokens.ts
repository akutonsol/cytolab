/**
 * Literal token values for contexts that can't read CSS variables — chiefly
 * recharts (SVG fills/strokes are computed in JS). Keep these in lockstep with
 * the CSS variables in globals.css (real design spec).
 */
export const CHART = {
  primary: '#4f7df9',
  primarySoft: '#eaf1ff',
  ink: '#111827', // near-black secondary series
  success: '#22c55e',
  danger: '#ef4444',
  grid: '#edf2f7',
  track: '#e6eaf2',
  axis: '#9ca3af',
  barIdle: '#eef2f7',
} as const;

export const COLOR = {
  primary: '#4f7df9',
  text: '#111827',
  textSecondary: '#6b7280',
  textTertiary: '#9ca3af',
  border: '#e6eaf2',
  borderStrong: '#e6eaf2',
  surface: '#ffffff',
  bg: '#f6f8fc',
} as const;
