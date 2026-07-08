'use client';

// Shared design tokens + primitives for the V2 landing sections. Everything below
// the HeroV2 hero uses these so the whole page reads as one premium, purple,
// enterprise design language (Stripe / Linear / Vercel / Raycast quality).
import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export const PURPLE = '#7C5CFF';
export const PURPLE_DEEP = '#5B3FE0';
export const DARK = '#0B1020';
export const GRAY = '#6B7280';
export const INK_SOFT = '#43485a';
export const OFFWHITE = '#FAFAFB';
export const EASE = [0.22, 0.8, 0.2, 1] as const;

export const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: '0 1px 3px rgba(20,14,50,0.04), 0 18px 40px -18px rgba(44,30,96,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
};

// Fade-up on scroll into view (once). Respects reduced-motion via framer.
export function Reveal({ children, delay = 0, y = 22, style }: {
  children: React.ReactNode; delay?: number; y?: number; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-12%' });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: EASE }} style={style}>
      {children}
    </motion.div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
      letterSpacing: '0.18em', textTransform: 'uppercase', color: PURPLE,
      background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.18)',
      padding: '7px 14px', borderRadius: 999,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: PURPLE }} />
      {children}
    </span>
  );
}

// Standard centered section header (eyebrow + title + optional subtitle).
export function SectionHeader({ eyebrow, title, subtitle, align = 'center', maxWidth = 720 }: {
  eyebrow: string; title: React.ReactNode; subtitle?: React.ReactNode; align?: 'center' | 'left'; maxWidth?: number;
}) {
  const centered = align === 'center';
  return (
    <Reveal style={{ maxWidth, margin: centered ? '0 auto' : undefined, textAlign: centered ? 'center' : 'left' }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px, 3.4vw, 46px)', lineHeight: 1.06, fontWeight: 700, letterSpacing: '-0.03em', color: DARK }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ margin: '18px auto 0', maxWidth: 620, fontSize: 18, lineHeight: 1.6, color: INK_SOFT, marginLeft: centered ? 'auto' : 0, marginRight: centered ? 'auto' : 0 }}>
          {subtitle}
        </p>
      )}
    </Reveal>
  );
}

// Section shell — one environment background, consistent max width + gutters.
export function Section({ id, children, style, tint }: {
  id?: string; children: React.ReactNode; style?: React.CSSProperties; tint?: 'white' | 'soft' | 'dark';
}) {
  const bg = tint === 'dark' ? DARK : tint === 'soft' ? '#F6F5FB' : '#FFFFFF';
  return (
    <section id={id} style={{ position: 'relative', background: bg, padding: '120px 72px', overflow: 'hidden', ...style }}>
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto' }}>{children}</div>
    </section>
  );
}
