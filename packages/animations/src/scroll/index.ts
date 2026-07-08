// Scroll-choreography motion system. GSAP + ScrollTrigger utilities used to
// LAYER restrained, reduced-motion-aware motion onto existing sections — never
// to restyle, move, or rewrite them.
export { ensureScrollTrigger, prefersReducedMotion, MOTION } from './core';
export type { Target } from './core';
export { reveal, type RevealOpts } from './reveal';
export { fadeUp } from './fadeUp';
export { fadeIn } from './fadeIn';
export { scaleIn } from './scaleIn';
export { stagger } from './stagger';
export { parallax } from './parallax';
export { sectionTransition } from './sectionTransition';
