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
          2: 'var(--color-surface-2)',
          3: 'var(--color-surface-3)',
          hover: 'var(--color-surface-hover)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          soft: 'var(--color-border-soft)',
          subtle: 'var(--color-border-subtle)',
          card: 'var(--color-border-card)',
          strong: 'var(--color-border-strong)',
        },
        text: {
          DEFAULT: 'var(--color-text)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          disabled: 'var(--color-text-disabled)',
          heading: 'var(--color-text-heading)',
          // Named `ink`, not `body`: a `text.body` key would collide with the
          // existing `fontSize.body`, and `text-body` would then set a colour too.
          ink: 'var(--color-text-body)',
          muted: 'var(--color-text-muted)',
        },
        'table-header': 'var(--color-table-header)',
        'table-cell': 'var(--color-table-cell)',
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
        // ── Reference design-system tokens (adopted app-wide) ──────
        'charcoal-heading': '#0F172A',
        background: '#f7fafd',
        'surface-container': '#ebeef1',
        'surface-container-low': '#f1f4f7',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#e5e8eb',
        'surface-container-highest': '#e0e3e6',
        'surface-bright': '#f7fafd',
        'surface-variant': '#e0e3e6',
        'surface-dim': '#d7dadd',
        // Primary — our indigo (kept via --color-primary), plus reference containers
        'primary-container': '#4f46e5',
        'primary-fixed': '#e2dfff',
        'primary-fixed-dim': '#c3c0ff',
        'on-primary': '#ffffff',
        'on-primary-container': '#dad7ff',
        // Secondary / muted
        secondary: '#49607e',
        'on-secondary': '#ffffff',
        'secondary-container': '#c4dcff',
        'on-secondary-container': '#49617f',
        // Outline / border
        outline: '#777587',
        'outline-variant': '#c7c4d8',
        // On-surface text
        'on-surface': '#181c1e',
        'on-surface-variant': '#464555',
        'on-background': '#181c1e',
        // Status
        'status-rose': '#E11D48',
        'status-sage': '#65A30D',
        'slate-text': '#1E293B',
        // Error
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
        card: 'var(--radius-card)',
        'card-lg': 'var(--radius-card-lg)',
        modal: 'var(--radius-modal)',
        button: 'var(--radius-button)',
        input: 'var(--radius-input)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
        avatar: 'var(--radius-avatar)',
        panel: 'var(--radius-panel)',
      },
      // Motion primitives (Tier 1). Prefer the semantic shorthand in components
      // (`transition: colors var(--motion-hover)`); these back utility usage.
      transitionDuration: {
        instant: 'var(--duration-instant)',
        fast: 'var(--duration-fast)',
        quick: 'var(--duration-quick)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
        slower: 'var(--duration-slower)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        emphasized: 'var(--ease-emphasized)',
        smooth: 'var(--ease-in-out)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        card: 'var(--shadow-card)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        float: 'var(--shadow-float)',
        'card-hover': 'var(--shadow-card-hover)',
        'card-soft': 'var(--shadow-card-soft)',
        'card-raised': 'var(--shadow-card-raised)',
      },
      fontFamily: {
        sans: 'var(--font-family)',
        // ── Reference design-system families ──────────────────────
        display: ['Geist', 'sans-serif'],
        'headline-lg': ['Geist', 'sans-serif'],
        'headline-md': ['Geist', 'sans-serif'],
        'headline-sm': ['Geist', 'sans-serif'],
        'label-sm': ['Geist', 'sans-serif'],
        'label-md': ['Geist', 'sans-serif'],
        'body-lg': ['Inter', 'sans-serif'],
        'body-md': ['Inter', 'sans-serif'],
        'body-sm': ['Inter', 'sans-serif'],
      },
      fontSize: {
        // ── Reference design-system type scale ────────────────────
        display: ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '30px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '26px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        // Full spec type scale (line-heights: hero/h1/h2 = 1.2, mid = 1.35, body = 1.5)
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
