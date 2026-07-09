/**
 * Literal token values for JS-side consumers.
 *
 * CORRECTION (Sprint 3): this file used to claim recharts "can't read CSS
 * variables". That is false — `var()` resolves inside SVG presentation attributes
 * (`fill`, `stroke`), verified in a live browser. `records/page.tsx` now feeds
 * `<Cell fill="var(--chart-specimen-…)">` straight from the token layer.
 *
 * These literals remain only for code that must *compute* on a colour (interpolate,
 * darken, compare). Prefer `var(--token)` everywhere else, and keep anything here
 * in lockstep with globals.css.
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
