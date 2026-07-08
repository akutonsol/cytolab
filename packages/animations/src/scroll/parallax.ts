import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, type Target } from './core';

/**
 * Scroll-linked parallax drift. `amount` is total px travel across the scroll
 * range (negative moves up as you scroll down). Scrubbed to scroll position —
 * subtle depth, never a slide-show. No-op under reduced motion.
 */
export function parallax(target: Target, opts: { amount?: number; axis?: 'y' | 'x'; start?: string; end?: string } = {}): () => void {
  const els = resolve(target);
  if (!els.length || prefersReducedMotion()) return () => {};
  const { amount = -60, axis = 'y', start = 'top bottom', end = 'bottom top' } = opts;
  ensureScrollTrigger();

  const tweens = els.map((el) => gsap.fromTo(el,
    { [axis]: 0 },
    { [axis]: amount, ease: 'none', scrollTrigger: { trigger: el, start, end, scrub: true, invalidateOnRefresh: true } },
  ));
  return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
}
