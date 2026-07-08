import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, MOTION, type Target } from './core';
import type { RevealOpts } from './reveal';

/**
 * Pure opacity reveal — never writes transform, so it is safe to layer over
 * elements that already run their own CSS transform animations (e.g. the
 * heartbeat stat card). Pass `each` to stagger a group.
 */
export function fadeIn(target: Target, opts: RevealOpts & { each?: number } = {}): () => void {
  const els = resolve(target);
  if (!els.length) return () => {};
  const { duration = 0.7, delay = 0, ease = MOTION.ease, start = MOTION.start, once = true, each } = opts;

  if (prefersReducedMotion()) { gsap.set(els, { opacity: 1 }); return () => {}; }
  ensureScrollTrigger();

  const tween = gsap.from(els, {
    opacity: 0, duration, delay, ease, stagger: each,
    scrollTrigger: { trigger: els[0], start, once, invalidateOnRefresh: true },
  });
  return () => { tween.scrollTrigger?.kill(); tween.kill(); };
}
