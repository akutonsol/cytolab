import { gsap, ensureScrollTrigger, prefersReducedMotion, resolve, type Target } from './core';

/**
 * Blended scroll transition: scrub a numeric CSS variable (default `--blend`,
 * 0→1) across a section's scroll range so a light/dark surface can crossfade
 * instead of hard-cutting. Read the variable in the element's background (e.g.
 * an opacity-driven overlay). Reduced motion pins it to its resting value.
 */
export function sectionTransition(
  target: Target,
  opts: { varName?: string; from?: number; to?: number; start?: string; end?: string; rest?: number } = {},
): () => void {
  const els = resolve(target);
  if (!els.length) return () => {};
  const { varName = '--blend', from = 0, to = 1, start = 'top bottom', end = 'top center', rest = to } = opts;

  const set = (el: Element, v: number) => (el as HTMLElement).style.setProperty(varName, String(v));

  if (prefersReducedMotion()) { els.forEach((el) => set(el, rest)); return () => {}; }
  ensureScrollTrigger();

  const tweens = els.map((el) => {
    const proxy = { v: from };
    set(el, from);
    return gsap.to(proxy, {
      v: to, ease: 'none',
      scrollTrigger: { trigger: el, start, end, scrub: true, invalidateOnRefresh: true },
      onUpdate: () => set(el, proxy.v),
    });
  });
  return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill(); });
}
