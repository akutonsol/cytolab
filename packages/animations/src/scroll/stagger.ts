import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, MOTION, type Target } from './core';
import type { RevealOpts } from './reveal';

/**
 * Staggered reveal for a group of siblings (logo wall, feature cards). Each item
 * fades + rises with a small offset so the group settles as a wave, not a pop.
 */
export function stagger(target: Target, opts: RevealOpts & { each?: number; triggerEl?: Element } = {}): () => void {
  const els = resolve(target);
  if (!els.length) return () => {};
  const { y = 20, duration = 0.7, ease = MOTION.ease, start = MOTION.start, once = true, each = 0.08, triggerEl } = opts;

  if (prefersReducedMotion()) { gsap.set(els, { opacity: 1, y: 0, clearProps: 'transform' }); return () => {}; }
  ensureScrollTrigger();

  const tween = gsap.from(els, {
    opacity: 0, y, duration, ease, stagger: each,
    scrollTrigger: { trigger: triggerEl ?? els[0], start, once, invalidateOnRefresh: true },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}
