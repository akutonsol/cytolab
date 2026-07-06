import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-serif)', 'DM Serif Display', 'serif'],
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'Space Mono', 'monospace'],
      },
      colors: {
        bg: '#F0EFE9',
        bg2: '#E8E7E1',
        ink: '#09090E',
        blue: '#4F46E5',
        blue2: '#3f97ef',
      },
    },
  },
  plugins: [],
}
export default config
