import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, MOTION, type Target } from './core';
import type { RevealOpts } from './reveal';

/** Gentle scale-up + fade reveal. Subtle (0.96 → 1), never a pop. */
export function scaleIn(target: Target, opts: RevealOpts & { from?: number } = {}): () => void {
  const els = resolve(target);
  if (!els.length) return () => {};
  const { duration = MOTION.duration, delay = 0, ease = MOTION.ease, start = MOTION.start, once = true, from = 0.96 } = opts;

  if (prefersReducedMotion()) { gsap.set(els, { opacity: 1, scale: 1, clearProps: 'transform' }); return () => {}; }
  ensureScrollTrigger();

  const tween = gsap.from(els, {
    opacity: 0, scale: from, duration, delay, ease, transformOrigin: 'center',
    scrollTrigger: { trigger: els[0], start, once, invalidateOnRefresh: true },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}
