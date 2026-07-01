import type { Config } from 'tailwindcss';

/**
 * Premium UI design foundation (real design spec). Colors/radii/shadows resolve
 * to the CSS variables in globals.css so AntD (ConfigProvider) and Tailwind
 * utilities share one source of truth. Preflight is OFF: AntD ships its own reset.
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
          card: 'var(--color-border-card)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          disabled: 'var(--color-text-disabled)',
        },
        inputbg: 'var(--color-input-bg)',
        placeholder: 'var(--color-placeholder)',
        purple: 'var(--color-purple)',
        cardblue: 'var(--color-card-blue)',
        lightgray: 'var(--color-light-gray)',
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
        'card-lg': 'var(--radius-card-lg)',
        modal: 'var(--radius-modal)',
        button: 'var(--radius-button)',
        input: 'var(--radius-input)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
        avatar: 'var(--radius-avatar)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-card)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        float: 'var(--shadow-float)',
        'card-hover': 'var(--shadow-card-hover)',
      },
      fontFamily: {
        sans: 'var(--font-family)',
      },
      fontSize: {
        // Full spec type scale (line-heights: display/hero/h1/h2 = 1.2, mid = 1.35, body = 1.5)
        display: ['48px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        hero: ['40px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['32px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: ['28px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        h3: ['24px', { lineHeight: '1.35', fontWeight: '600' }],
        title: ['20px', { lineHeight: '1.35', fontWeight: '600' }],
        section: ['18px', { lineHeight: '1.35', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.5' }],
        small: ['14px', { lineHeight: '1.5' }],
        caption: ['12px', { lineHeight: '1.5' }],
        tiny: ['11px', { lineHeight: '1.5' }],
        // Primitive helpers (kept for existing components)
        label: ['12px', { lineHeight: '1.4', letterSpacing: '0.01em' }],
        meta: ['12px', { lineHeight: '1.4' }],
        stat: ['32px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '800' }],
      },
    },
  },
  plugins: [],
};

export default config;
