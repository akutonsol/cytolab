// @cytolab/animations — shared motion primitives.
//
// This CENTRALIZES the constants/variants already used across CYTOLAB surfaces —
// it does NOT redesign any animation. Values here are the exact ones the marketing
// sections use today, so swapping a local copy for an import is behavior-identical.
//
// framer-motion is an OPTIONAL peer: the constants/helpers are plain data, so this
// package stays dependency-light. `Variants`/`Transition` are type-only imports.
import type { Variants, Transition } from 'framer-motion';

// ── Easing ──────────────────────────────────────────────────────────────────
/** Primary spring-like ease used across marketing sections. */
export const EASE = [0.22, 0.8, 0.2, 1] as const;
/** Brand-doc alternative ease. */
export const EASE_BRAND = [0.22, 0.61, 0.36, 1] as const;

// ── Durations (seconds) ─────────────────────────────────────────────────────
export const DURATION = { micro: 0.3, base: 0.55, reveal: 0.7, hero: 0.8 } as const;

/** `whileInView` viewport preset — reveal once, slightly before fully on-screen. */
export const IN_VIEW_ONCE = { once: true, margin: '-100px' } as const;

// ── Framer Motion variants ──────────────────────────────────────────────────
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.reveal, ease: EASE } },
};

/** Staggered reveal for a section that enters on scroll. */
export const scrollReveal = (delay = 0): Variants => ({
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay } },
});

// ── Continuous "float" helpers (hero / cards drifting in place) ──────────────
/** `animate` payload for a gentle vertical float. */
export const floatAnimate = (distance = 8) => ({ y: [0, -distance, 0] });
/** `transition` payload for a gentle vertical float. */
export const floatTransition = (duration = 6, delay = 0): Transition => ({
  duration, delay, repeat: Infinity, ease: 'easeInOut',
});

// ── GSAP timeline factory (marketing uses GSAP + Lenis) ─────────────────────
// gsap is passed in so this package never hard-depends on it. Returns a timeline
// with CYTOLAB's default ease/duration applied.
export function createTimeline(gsap: { timeline: (opts?: unknown) => unknown }, opts?: { duration?: number }) {
  return gsap.timeline({
    defaults: { duration: opts?.duration ?? DURATION.reveal, ease: 'power3.out' },
  });
}
