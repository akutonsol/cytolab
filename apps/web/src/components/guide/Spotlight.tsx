'use client';

import { useEffect } from 'react';

/**
 * Highlights the current step's target by toggling a class on the element marked
 * `data-guide="<target>"` — so the ring is always perfectly positioned (it lives
 * ON the element, no coordinate math, immune to scroll containers and late
 * layout shifts). Polls each frame so it follows async-mounted targets and
 * moves cleanly when the step (target) changes. Renders no DOM of its own.
 */
export function Spotlight({ target }: { target: string }) {
  useEffect(() => {
    const CLASS = 'guide-target';
    let current: Element | null = null;
    let raf = 0;
    const tick = () => {
      const next = document.querySelector(`[data-guide="${target}"]`);
      if (next !== current) {
        current?.classList.remove(CLASS);
        current = next;
        current?.classList.add(CLASS);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      current?.classList.remove(CLASS);
    };
  }, [target]);

  return null;
}
