'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import Lenis from 'lenis';

/**
 * Single document smooth-scroll owner for marketing surfaces.
 *
 * Keep this intentionally small: one Lenis instance, one rAF loop, no CSS smooth
 * scroll, and no GSAP ticker unless a page actually introduces ScrollTrigger.
 */
export default function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || reducedMotion) return;

    const marketingPath =
      pathname === '/' ||
      ['/solutions', '/contact', '/book-demo', '/compliance', '/privacy', '/terms', '/platform', '/herov2'].some((path) =>
        pathname === path || pathname.startsWith(`${path}/`),
      );
    if (!marketingPath) return;

    const lenis = new Lenis({
      duration: 0.62,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1,
      syncTouch: false,
      autoRaf: false,
    });

    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [pathname, reducedMotion]);

  return <>{children}</>;
}
