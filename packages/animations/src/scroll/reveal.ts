import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, MOTION, type Target } from './core';

export type RevealOpts = {
  y?: number; x?: number; opacity?: number;
  duration?: number; delay?: number; ease?: string;
  start?: string; once?: boolean;
};

/**
 * The core section-reveal: a small fade + translate that settles into place as
 * the element scrolls into view. Never bounces or overshoots. Returns a cleanup
 * function that kills the tween/trigger.
 */
export function reveal(target: Target, opts: RevealOpts = {}): () => void {
  const els = resolve(target);
  if (!els.length) return () => {};
  const { y = MOTION.y, x = 0, duration = MOTION.duration, delay = 0, ease = MOTION.ease, start = MOTION.start, once = true } = opts;

  if (prefersReducedMotion()) { gsap.set(els, { opacity: 1, x: 0, y: 0, clearProps: 'transform' }); return () => {}; }
  ensureScrollTrigger();

  const tween = gsap.from(els, {
    opacity: 0, y, x, duration, delay, ease,
    scrollTrigger: { trigger: els[0], start, once, invalidateOnRefresh: true },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}
