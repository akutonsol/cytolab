'use client';

// Landing-only hero composition. The 3D vial renderer (HeroVial) is used as the
// centerpiece — this component choreographs the scene around it: an illuminated
// ripple platform, the stacked glass telemetry cards, a cinematic entrance, and
// LAYERED cursor parallax (platform, vial, and cards each drift at a different
// rate for depth). The vial's own material/motion polish is opt-in via the
// `polish` prop so the login/CTA consumers of HeroVial stay unchanged.
import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';

const EASE = [0.22, 0.8, 0.2, 1] as const;

const HeroVial = dynamic(() => import('./HeroVial'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%' }} />,
});
const HeroStatCards = dynamic(() => import('./HeroStatCards'), { ssr: false });

export function HeroScene() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Cursor parallax — write CSS vars on the stage; each layer scales them
  // differently via calc(). Skipped under reduced motion. rAF-throttled.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0; let mx = 0; let my = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty('--mx', mx.toFixed(3));
        el.style.setProperty('--my', my.toFixed(3));
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      {/* ── Blood-into-water ripples ── the vial's blood drips into the water that
          fills the bottom of the hero (the water surface itself is the full-width
          fade rendered in the page background). Concentric rings CONTINUOUSLY
          emanate from the point where the tilted tube's base meets the surface,
          like drops falling in, with a soft red diffusion plume mixing outward.
          Everything is centered on the vial's landing point (~46% across, low) and
          flattened into perspective (scaleY) so it lies ON the water. Moves LEAST
          (deep). Animated with framer-motion. */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        transform: 'translate(calc(var(--mx,0) * 7px), calc(var(--my,0) * 4px))', transition: 'transform 0.3s ease-out', willChange: 'transform',
      }}>
        {/* emitter point at the vial's landing spot, flattened into the surface */}
        <div style={{ position: 'absolute', left: '46%', bottom: '17%', transform: 'scaleY(0.30)', transformOrigin: 'center' }}>
          {/* blood diffusion plume — red mixing into the water, gently breathing */}
          <motion.div
            style={{
              position: 'absolute', left: 0, top: 0, width: 360, height: 360, x: '-50%', y: '-50%', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(208,36,64,0.32) 0%, rgba(220,72,98,0.16) 40%, transparent 70%)', filter: 'blur(11px)',
            }}
            animate={{ scale: [0.82, 1.16, 0.82], opacity: [0.5, 0.78, 0.5] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* continuously emanating ripple rings — pink-red (blood) inner, fading to
              clear water as they spread */}
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              style={{
                position: 'absolute', left: 0, top: 0, width: 560, height: 560, x: '-50%', y: '-50%',
                borderRadius: '50%', border: '1.6px solid rgba(224,84,112,0.5)',
              }}
              initial={{ scale: 0.12, opacity: 0 }}
              animate={{ scale: 1, opacity: [0, 0.55, 0] }}
              transition={{ duration: 5.2, repeat: Infinity, delay: i * 1.3, ease: 'easeOut' }}
            />
          ))}
        </div>
        {/* bright specular contact glow right at the landing point */}
        <div style={{
          position: 'absolute', left: '46%', bottom: '15.5%', width: 190, height: 64, transform: 'translate(-50%,0)',
          background: 'radial-gradient(ellipse 60% 100% at 50% 100%, rgba(255,255,255,0.95) 0%, rgba(255,248,252,0.5) 36%, transparent 72%)',
          filter: 'blur(5px)',
        }} />
      </div>

      {/* (No atmosphere aura — a circular bloom behind the vial reads as an obvious
          light blob. The environment lives entirely in the page background so the
          light stays directional/seamless.) */}

      {/* ── 3D vial ── parallax outer (medium rate, opposite the platform) wraps
          the entrance motion.div so the two transforms never fight. */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2,
        transform: 'translate(calc(var(--mx,0) * -7px), calc(var(--my,0) * -5px))', transition: 'transform 0.25s ease-out', willChange: 'transform',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.965, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.15, ease: EASE, delay: 0.25 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* `bare` makes the WebGL canvas TRANSPARENT (skips the opaque scene-bg
              + backdrop planes) so the page's illuminated environment shows through
              — no visible canvas edge / no left-vs-right seam. Blood fills to the
              shoulder (full column, cap connected); label lower-centered. */}
          <HeroVial fill={1.38} tilt={-0.055} labelY={0.04} polish bare />
        </motion.div>
      </div>

      {/* ── Telemetry cards ── evenly stacked on the right, parallax at the
          FASTEST rate (nearest layer). */}
      <div style={{
        position: 'absolute', top: '7%', bottom: '7%', right: '3%', width: 300, zIndex: 3,
        transform: 'translate(calc(var(--mx,0) * -13px), calc(var(--my,0) * -8px))', transition: 'transform 0.2s ease-out', willChange: 'transform',
      }}>
        <HeroStatCards arrangement="stack" />
      </div>
    </div>
  );
}
