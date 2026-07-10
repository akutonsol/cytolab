'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/**
 * The product's single "I am working" signal.
 *
 * Experience Principle §7: no action, navigation or fetch may leave the user without
 * feedback for more than 150ms. This bar is the floor of that guarantee — it appears for
 * *any* in-flight query or mutation, so a screen that forgot its own skeleton still says
 * something.
 *
 * Why it is not a spinner: a spinner in the corner competes with the content. A 2px bar
 * at the very top is peripheral — it answers "is it working?" without pulling the eye
 * away from the thing being loaded (Principle §1: information before decoration).
 *
 * Behaviour:
 *   - shows within one frame of work starting (no artificial "wait 200ms" delay: the
 *     requirement is feedback within 100ms)
 *   - eases toward 90% while work is outstanding, never reaching 100% until it is done,
 *     so it never lies about being finished
 *   - holds for a minimum visible time so a 30ms request does not produce a flash
 */
const MIN_VISIBLE_MS = 240;

export function GlobalProgress() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const pathname = usePathname();

  const busy = fetching + mutating > 0;

  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef(0);
  const raf = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation itself counts as work, even before a query starts.
  useEffect(() => {
    setVisible(true);
    setProgress(8);
    startedAt.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (busy) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (!visible) {
        setVisible(true);
        setProgress(8);
        startedAt.current = Date.now();
      }
      const tick = () => {
        setProgress((p) => (p >= 90 ? 90 : p + (90 - p) * 0.06));
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      return () => {
        if (raf.current) cancelAnimationFrame(raf.current);
      };
    }

    if (!visible) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    setProgress(100);
    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(MIN_VISIBLE_MS - elapsed, 0) + 180; // let the 100% paint
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, wait);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  return (
    <div
      aria-hidden={!visible}
      role="progressbar"
      aria-busy={busy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 2000,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: `opacity var(--motion-exit)`,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--color-primary)',
          boxShadow: '0 0 8px var(--color-glow)',
          transition: `width var(--motion-hover)`,
        }}
      />
    </div>
  );
}
