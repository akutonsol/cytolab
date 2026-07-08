'use client';

import { ReactLenis } from 'lenis/react';
import { useEffect, useState } from 'react';

/**
 * Global smooth-scroll engine (Lenis).
 *
 * - Uses the document root as the scroll container (`root`), so inner
 *   `overflow: auto` containers keep native scrolling and nothing breaks.
 * - `ReactLenis` initializes Lenis once, cleans up on unmount, and is
 *   React-Strict-Mode safe (handles the double-mount/unmount cycle).
 * - Lenis runs a single internal `requestAnimationFrame` loop (`autoRaf`),
 *   so there is no extra render loop.
 * - Disabled entirely when the user prefers reduced motion → native scroll.
 * - Purely a scroll-feel enhancement: it renders no wrapper DOM in `root`
 *   mode, so there is no layout shift and no visual change.
 *
 * GSAP: not currently a dependency, so there is nothing to synchronize. See
 * the note at the bottom of this file for the exact wiring to enable when
 * GSAP/ScrollTrigger is introduced.
 */
export default function LenisProvider({ children }: { children: React.ReactNode }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Respect reduced motion — no Lenis instance, fall back to native scrolling.
  if (reducedMotion) return <>{children}</>;

  return (
    <ReactLenis
      root
      options={{
        lerp: 0.1, // smoothing factor (future-configurable)
        smoothWheel: true,
        wheelMultiplier: 1,
        // syncTouch omitted → native touch scrolling preserved on mobile.
        // autoRaf left on → Lenis drives one efficient rAF loop.
      }}
    >
      {children}
    </ReactLenis>
  );
}

/*
 * ── GSAP / ScrollTrigger synchronization (enable when GSAP is added) ────────
 *
 * GSAP is NOT a dependency yet, so there is nothing to sync and Lenis runs its
 * own rAF loop. When ScrollTrigger is introduced, drive Lenis from GSAP's
 * ticker (a single shared rAF) instead:
 *
 *   1. Pass `options={{ ...options, autoRaf: false }}` above so Lenis does not
 *      run its own loop.
 *   2. Read the Lenis instance via `useLenis()` inside a child and wire it:
 *
 *        import gsap from 'gsap';
 *        import { ScrollTrigger } from 'gsap/ScrollTrigger';
 *        gsap.registerPlugin(ScrollTrigger);
 *
 *        useEffect(() => {
 *          if (!lenis) return;
 *          lenis.on('scroll', ScrollTrigger.update);
 *          const raf = (time: number) => lenis.raf(time * 1000);
 *          gsap.ticker.add(raf);
 *          gsap.ticker.lagSmoothing(0);
 *          return () => {
 *            gsap.ticker.remove(raf);
 *            lenis.off('scroll', ScrollTrigger.update);
 *          };
 *        }, [lenis]);
 */
