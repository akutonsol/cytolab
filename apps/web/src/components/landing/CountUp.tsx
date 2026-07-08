'use client';

// Reveal-triggered count-up. Eases a number from 0 → value ONCE when it scrolls
// into view, then stops (no re-trigger). Respects prefers-reduced-motion (shows
// the final value immediately). Format-preserving: pass prefix/suffix/decimals
// so "500M+", "99.9%", "2,500+" render exactly as before once settled.
import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function CountUp({ value, decimals = 0, duration = 1600, prefix = '', suffix = '', className, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplay(value); return; }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          let raf = 0; let start = 0;
          const tick = (now: number) => {
            if (!start) start = now;
            const p = Math.min(1, (now - start) / duration);
            setDisplay(value * (1 - Math.pow(1 - p, 3))); // easeOutCubic
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          io.disconnect();
          return () => cancelAnimationFrame(raf);
        }
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const text = display.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className={className} style={style}>{prefix}{text}{suffix}</span>;
}
