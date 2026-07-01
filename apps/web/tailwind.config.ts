import type { Config } from 'tailwindcss';

/**
 * Premium UI design foundation. Colors/radii/shadows resolve to the CSS
 * variables defined in globals.css so AntD (ConfigProvider) and Tailwind
 * utilities share one source of truth. Preflight is OFF: AntD ships its own
 * reset and the existing screens rely on it — we add a minimal base ourselves.
 */
const config: Config = {
  corePlugins: { preflight: false },
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          soft: 'var(--color-primary-soft)',
          on: 'var(--color-primary-on)',
        },
        bg: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          alt: 'var(--color-surface-alt)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        success: { DEFAULT: 'var(--color-success)', soft: 'var(--color-success-soft)' },
        warning: { DEFAULT: 'var(--color-warning)', soft: 'var(--color-warning-soft)' },
        danger: { DEFAULT: 'var(--color-danger)', soft: 'var(--color-danger-soft)' },
        info: { DEFAULT: 'var(--color-info)', soft: 'var(--color-info-soft)' },
        neutralbadge: { DEFAULT: 'var(--color-neutral-badge)', soft: 'var(--color-neutral-badge-soft)' },
        pastel: {
          lavender: 'var(--pastel-lavender)',
          sky: 'var(--pastel-sky)',
          peach: 'var(--pastel-peach)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        float: 'var(--shadow-float)',
      },
      fontFamily: {
        sans: 'var(--font-family)',
      },
      fontSize: {
        label: ['12px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        meta: ['12px', { lineHeight: '1.4' }],
        stat: ['30px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        display: ['32px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
      },
    },
  },
  plugins: [],
};

export default config;
