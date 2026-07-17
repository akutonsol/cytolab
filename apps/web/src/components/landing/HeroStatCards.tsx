'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, BrainCircuit, Clock, Layers } from 'lucide-react';

// Floating live AI-telemetry panels that overlay the hero vial. Glass HUD panels
// (Vision-Pro-ish): count-up numbers, a continuously animated sparkline, a LIVE
// pulse, independent float, mouse parallax, and staggered mount reveal.
//
// Palette note: the sparkline is red → coral-PINK (#FF7A8A), not true coral —
// the app enforces a zero-orange rule, and a real coral would read as orange.

const RED = '#E63946';
const CORAL = '#FF7A8A';
const GREEN = '#16A34A';
const INK = '#111111';

type CardSpec = {
  id: string;
  Icon: typeof BrainCircuit;
  title: string;
  target: number;
  decimals: number;
  suffix: string;
  change: string;
  arrow: 'up' | 'down';
  positive: boolean; // green when true
  context: string;
  badge?: string; // SLA-style pill
  processing?: boolean; // "live processing" dot in the metadata row
  floatClass: string;
  seed: number;
};

const CARDS: CardSpec[] = [
  {
    id: 'confidence',
    Icon: BrainCircuit,
    title: 'On-time sign-out',
    target: 98.4, decimals: 1, suffix: '%',
    change: '2.6%', arrow: 'up', positive: true,
    context: '',
    floatClass: 'hsc-f1', seed: 0.0,
  },
  {
    id: 'processed',
    Icon: Layers,
    title: 'Specimens Processed',
    target: 12.8, decimals: 1, suffix: 'M',
    change: '18%', arrow: 'up', positive: true,
    context: '',
    floatClass: 'hsc-f2', seed: 1.7,
  },
  {
    id: 'turnaround',
    Icon: Clock,
    title: 'Avg. Turnaround Time',
    target: 18.4, decimals: 1, suffix: ' hrs',
    change: '22%', arrow: 'down', positive: false,
    context: '',
    floatClass: 'hsc-f3', seed: 3.3,
  },
];

// Count a number up from 0 → target once, after `delay` ms, easeOutCubic.
function useCountUp(target: number, decimals: number, delay: number, duration = 1700) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    let startTs = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs - delay;
      if (elapsed <= 0) { raf = requestAnimationFrame(tick); return; }
      const p = Math.min(1, elapsed / duration);
      setVal(target * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration]);
  return val.toFixed(decimals);
}

// Continuously animated sparkline — live data scrolling right→left, drawn to a
// canvas with a red→coral gradient stroke, rounded joins and a glowing endpoint.
function Sparkline({ seed }: { seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = canvas.clientWidth;
    let h = canvas.clientHeight;
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const N = 46;
    let t = seed * 10;
    // Seed the buffer with the wave so it starts full (never a blank frame).
    const sample = (tt: number) =>
      0.5 + 0.30 * Math.sin(tt * 1.6 + seed) + 0.14 * Math.sin(tt * 3.3 + seed * 2);
    const buf: number[] = Array.from({ length: N }, (_, i) => sample(t - (N - i) * 0.16));

    let raf = 0;
    let acc = 0;
    let prev = 0;
    const step = 0.055; // seconds between new samples
    const pad = 5;

    const draw = (ts: number) => {
      const dt = prev ? (ts - prev) / 1000 : 0;
      prev = ts;
      acc += dt;
      while (acc >= step) {
        acc -= step;
        t += 0.16;
        buf.shift();
        buf.push(sample(t) + (Math.sin(t * 7.1 + seed) * 0.02));
      }

      ctx.clearRect(0, 0, w, h);
      const gy = (v: number) => pad + (1 - v) * (h - pad * 2);
      const gx = (i: number) => (i / (N - 1)) * w;

      // Smooth path (quadratic midpoint smoothing).
      ctx.beginPath();
      ctx.moveTo(gx(0), gy(buf[0]));
      for (let i = 1; i < N; i++) {
        const x0 = gx(i - 1), y0 = gy(buf[i - 1]);
        const x1 = gx(i), y1 = gy(buf[i]);
        ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      }

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, RED);
      grad.addColorStop(1, CORAL);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Soft area fill under the line.
      ctx.lineTo(gx(N - 1), h);
      ctx.lineTo(gx(0), h);
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, 'rgba(255,122,138,0.18)');
      fill.addColorStop(1, 'rgba(255,122,138,0)');
      ctx.fillStyle = fill;
      ctx.fill();

      // Glowing endpoint.
      const ex = gx(N - 1), ey = gy(buf[N - 1]);
      ctx.shadowColor = CORAL;
      ctx.shadowBlur = 10;
      ctx.fillStyle = CORAL;
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, ey, 1.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowBlur = 0;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [seed]);

  return <canvas ref={ref} style={{ width: '100%', height: 52, display: 'block' }} />;
}

function StatCard({ spec, index }: { spec: CardSpec; index: number }) {
  const value = useCountUp(spec.target, spec.decimals, index * 150 + 250);
  const Arrow = spec.arrow === 'up' ? ArrowUpRight : ArrowDownRight;
  // Reference uses a single dark change row (no green/red coding).
  const changeColor = INK;

  return (
    <motion.div
      className="hsc-mount"
      initial={{ opacity: 0, y: 28, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={`hsc-float ${spec.floatClass}`}>
        <div className="hsc-parallax">
          <div className="hsc-card">
            {/* LIVE badge */}
            <div className="hsc-live">
              <span className="hsc-live-dot" />
              LIVE
            </div>

            {/* Header */}
            <div className="hsc-head">
              <span className="hsc-ico"><spec.Icon size={16} strokeWidth={2.2} /></span>
              <span className="hsc-title">{spec.title}</span>
            </div>

            {/* Body */}
            <div className="hsc-body">
              <div className="hsc-stat">
                {value}<span className="hsc-unit">{spec.suffix}</span>
              </div>
              <div className="hsc-change" style={{ color: changeColor }}>
                <Arrow size={14} strokeWidth={2.6} />
                {spec.change}
                <span className="hsc-change-sub">vs last week</span>
              </div>
            </div>

            {/* Live sparkline */}
            <Sparkline seed={spec.seed} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// `arrangement`:
//  • 'column' (default) — the original stacked column (used by any existing caller).
//  • 'orbit' — the three cards are absolutely placed on an arc around the tube
//    for the redesigned hero. Card internals (count-up, sparkline, float,
//    parallax, reduced-motion) are identical either way.
export default function HeroStatCards({ arrangement = 'column' }: { arrangement?: 'column' | 'orbit' | 'stack' } = {}) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Mouse parallax — write CSS vars directly (no re-render).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      const el = rootRef.current;
      if (el) { el.style.setProperty('--px', String(nx)); el.style.setProperty('--py', String(ny)); }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div ref={rootRef} className={`hsc-root hsc-${arrangement}`}>
      <style>{CSS}</style>
      {CARDS.map((c, i) =>
        arrangement === 'orbit'
          ? <div key={c.id} className={`hsc-anchor hsc-anchor-${i}`}><StatCard spec={c} index={i} /></div>
          : <StatCard key={c.id} spec={c} index={i} />,
      )}
    </div>
  );
}

const CSS = `
.hsc-root {
  display: flex;
  flex-direction: column;
  gap: 28px;
  perspective: 1200px;
  --px: 0; --py: 0;
}
/* Stack arrangement — the three cards evenly distributed top→bottom on the right
   (matches the reference). */
.hsc-stack { height: 100%; justify-content: space-between; gap: 0; }
/* Orbit arrangement — cards placed on an arc down the right of the stage so they
   float AROUND the (left-set) tube instead of stacking. */
.hsc-orbit { position: absolute; inset: 0; display: block; gap: 0; }
.hsc-orbit .hsc-anchor { position: absolute; }
.hsc-anchor-0 { top: 9%;  right: 6%; }
.hsc-anchor-1 { top: 39%; right: 0; }
.hsc-anchor-2 { top: 69%; right: 12%; }
@media (max-width: 1280px) {
  .hsc-anchor-0 { top: 5%;  right: 2%; }
  .hsc-anchor-1 { top: 38%; right: 0; }
  .hsc-anchor-2 { top: 71%; right: 5%; }
}
.hsc-float { will-change: transform; }
.hsc-parallax {
  transform: rotateX(calc(var(--py) * -1.6deg)) rotateY(calc(var(--px) * 1.6deg));
  transform-style: preserve-3d;
  transition: transform 0.25s ease-out;
}
.hsc-card {
  position: relative;
  width: 300px;
  height: 174px;
  border-radius: 24px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.74) 100%);
  -webkit-backdrop-filter: blur(32px) saturate(1.12);
  backdrop-filter: blur(32px) saturate(1.12);
  border: 1px solid rgba(255,255,255,0.65);
  box-shadow:
    0 34px 90px -30px rgba(35,20,80,0.16),
    0 12px 30px -16px rgba(35,20,80,0.10),
    inset 0 1px 0 rgba(255,255,255,0.9),
    inset 0 0 0 1px rgba(255,255,255,0.28);
  transition: transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease;
}
.hsc-card:hover {
  transform: translateY(-6px);
  box-shadow:
    0 46px 110px -32px rgba(35,20,80,0.22),
    0 16px 40px -18px rgba(35,20,80,0.12),
    inset 0 1px 0 rgba(255,255,255,0.95);
}
/* slow light sweep across the glass */
.hsc-card::after {
  content: '';
  position: absolute;
  inset: -40%;
  background: linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.55) 50%, transparent 58%);
  transform: translateX(-30%);
  animation: hscSheen 7s ease-in-out infinite;
  pointer-events: none;
}
@keyframes hscSheen {
  0%, 100% { transform: translateX(-35%); opacity: 0; }
  45% { opacity: 0.7; }
  50% { transform: translateX(35%); opacity: 0.7; }
  55% { opacity: 0; }
}
.hsc-live {
  position: absolute; top: 18px; right: 20px;
  display: flex; align-items: center; gap: 5px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
  color: ${GREEN};
}
.hsc-live-dot {
  width: 7px; height: 7px; border-radius: 50%; background: ${GREEN};
  box-shadow: 0 0 0 0 rgba(22,163,74,0.5);
  animation: hscPulse 1.8s ease-out infinite;
}
@keyframes hscPulse {
  0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.5); opacity: 1; }
  70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); opacity: 0.55; }
  100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); opacity: 1; }
}
.hsc-head { display: flex; align-items: center; gap: 9px; }
.hsc-ico {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 9px;
  background: rgba(230,57,70,0.10); color: ${RED};
}
.hsc-title {
  font-size: 13px; font-weight: 600; letter-spacing: 0.02em; color: #7A8191;
}
.hsc-body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 7px; }
.hsc-stat {
  font-size: 50px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; color: ${INK};
  font-variant-numeric: tabular-nums;
}
.hsc-unit { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-left: 2px; }
.hsc-change {
  display: flex; align-items: center; gap: 4px;
  font-size: 14px; font-weight: 600;
}
.hsc-change-sub { color: #9AA1AD; font-weight: 500; margin-left: 4px; }
.hsc-context {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 12px; font-weight: 500; color: #8A909C;
}
.hsc-proc-dot {
  width: 6px; height: 6px; border-radius: 50%; background: ${RED};
  animation: hscBlink 1.3s ease-in-out infinite;
}
@keyframes hscBlink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
.hsc-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 7px; border-radius: 999px;
  background: rgba(22,163,74,0.12); color: ${GREEN};
  font-size: 10px; font-weight: 700; letter-spacing: 0.01em;
}
/* independent floating — different amplitude + timing per card */
.hsc-f1 { animation: hscFloat1 9s ease-in-out infinite; }
.hsc-f2 { animation: hscFloat2 11s ease-in-out infinite; }
.hsc-f3 { animation: hscFloat3 10s ease-in-out infinite; }
@keyframes hscFloat1 { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes hscFloat2 { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes hscFloat3 { 0%,100% { transform: translateY(-2px); } 50% { transform: translateY(3px); } }
@media (prefers-reduced-motion: reduce) {
  .hsc-f1, .hsc-f2, .hsc-f3, .hsc-card::after, .hsc-live-dot, .hsc-proc-dot { animation: none; }
}
`;
