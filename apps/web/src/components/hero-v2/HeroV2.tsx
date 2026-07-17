'use client';

// ─────────────────────────────────────────────────────────────────────────────
// PathOS HOMEPAGE HERO — VERSION 2  (fully isolated; HeroV1 is untouched)
//
// Design language: Apple / Linear / Arc / Stripe / Raycast. Premium, editorial,
// minimal, scientific. The right side is NOT a dashboard screenshot — it is a
// living visualization of the diagnostic journey (specimen → signed report),
// composed entirely of DOM + CSS + Framer Motion (no WebGL, no canvas rect).
//
// Everything belongs to ONE environment: the background spans the whole hero,
// no hard edges, no separate left/right worlds. Motion is weightless — max 4px
// drift, 12–18s loops, no bounce/spin. Respects prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Hand, Scan, Brush, Circle, Plus, Minus, Check, RefreshCw,
  FlaskConical, Layers, Brain, UserRound, FileText, CheckCircle2, ShieldCheck,
  Target, Timer, Building2, Menu, X,
} from 'lucide-react';

const PURPLE = '#7C5CFF';
const DARK = '#0B1020';
const GRAY = '#6B7280';

// H&E staining treatment for the specimen image — the source is an over-saturated
// magenta cytology render, so we desaturate ~40%, lift brightness/contrast so the
// background reads as clear/white and cytoplasm as pale pink, and nudge the hue so
// nuclei settle into an authentic dark violet (hematoxylin). Applied only to the
// specimen — the AI overlays stay full purple.
const HE_FILTER = 'saturate(0.52) brightness(1.21) contrast(1.12) hue-rotate(-4deg)';

// Shared glass recipe for every floating card.
const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,0.78)',
  border: '1px solid rgba(255,255,255,0.55)',
  boxShadow: '0 24px 60px -20px rgba(11,16,32,0.18), 0 4px 14px -6px rgba(11,16,32,0.08)',
};

// ── ambient keyframes (CSS transforms → cheap, 60fps; disabled under RM) ──────
const KEYFRAMES = `
@keyframes hv2-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
/* AI scan pass — a thin lavender line sweeps top→bottom in ~2s, then ~7s rest
   (≈9s cycle). Faint but a touch stronger — calm analysis, not a sci-fi laser. */
@keyframes hv2-scanline { 0% { transform: translateY(-120%); opacity: 0; } 3% { opacity: .74; } 19% { opacity: .74; } 22% { transform: translateY(1010%); opacity: 0; } 100% { transform: translateY(1010%); opacity: 0; } }
/* AI overlays rest gently present, illuminate as the scan passes, settle back */
@keyframes hv2-idle { 0% { opacity: .34; } 6% { opacity: 1; } 20% { opacity: 1; } 36% { opacity: .34; } 100% { opacity: .34; } }
/* region-of-interest highlight — a soft glow that only appears during the pass */
@keyframes hv2-region { 0% { opacity: 0; } 7% { opacity: 1; } 22% { opacity: 1; } 42% { opacity: 0; } 100% { opacity: 0; } }
/* workflow pulse — travels the connector L→R ONCE per cycle, just after the scan,
   so the whole hero performs one complete analysis loop every ~9s */
@keyframes hv2-travel { 0%,20% { left: 0%; opacity: 0; } 25% { opacity: 1; } 52% { left: 100%; opacity: 1; } 57% { left: 100%; opacity: 0; } 100% { left: 100%; opacity: 0; } }
@keyframes hv2-heat { 0%,100% { opacity: .26; transform: scale(0.96); } 50% { opacity: .46; transform: scale(1.05); } }
/* individual nucleus outline — fades in (~600ms), holds, fades out; per-cell delay
   so only a few animate at once (AI detecting different nuclei) */
@keyframes hv2-nuc { 0% { opacity: 0; } 10% { opacity: .95; } 34% { opacity: .95; } 50% { opacity: 0; } 100% { opacity: 0; } }
/* whole-scene float — ±3px over 18s, almost imperceptible */
@keyframes hv2-herofloat { 0%,100% { transform: translateY(-3px); } 50% { transform: translateY(3px); } }
/* active workflow card breathing glow + border */
@keyframes hv2-active { 0%,100% { box-shadow: 0 10px 26px -10px rgba(124,92,255,0.45), 0 0 0 1px rgba(124,92,255,0.35), inset 0 1px 0 rgba(255,255,255,0.7); } 50% { box-shadow: 0 14px 34px -10px rgba(124,92,255,0.65), 0 0 0 1px rgba(124,92,255,0.6), 0 0 18px rgba(124,92,255,0.4), inset 0 1px 0 rgba(255,255,255,0.7); } }
@keyframes spin { to { transform: rotate(360deg); } }
/* ── living specimen ── microscope pan: the whole tissue drifts slowly within its
   scale overscan (1–3px), organic 4-point path, very slow. */
@keyframes hv2-microdrift { 0%,100% { transform: scale(1.18) translate(0px,0px); } 25% { transform: scale(1.18) translate(-3px,2px); } 50% { transform: scale(1.18) translate(2px,3px); } 75% { transform: scale(1.18) translate(3px,-1.5px); } }
/* AI-overlay layer drifts at a different depth/speed than the tissue (parallax) */
@keyframes hv2-drift { 0%,100% { transform: translate(0px,0px); } 30% { transform: translate(2.5px,-2.2px); } 60% { transform: translate(-2.2px,1.8px); } }
@keyframes hv2-drift2 { 0%,100% { transform: translate(0px,0px); } 40% { transform: translate(-2.6px,-2.4px); } 70% { transform: translate(2.2px,2.4px); } }
/* detection outline soft continuous pulse — always actively "detecting" */
@keyframes hv2-boxpulse { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
.hv2-cta { transition: transform .28s cubic-bezier(.22,.8,.2,1), box-shadow .28s ease; }
.hv2-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -12px rgba(11,16,32,0.42); }
.hv2-arrow { transition: transform .28s cubic-bezier(.22,.8,.2,1); }
.hv2-cta:hover .hv2-arrow { transform: translateX(4px); }
.hv2-menu-btn { display: none; }
.hv2-mobile-menu { display: none; }
.hv2-kpi-band {
  position: absolute;
  left: 40px;
  right: 40px;
  bottom: 14px;
  z-index: 3;
  min-height: 132px;
  border-radius: 24px;
  padding: 12px 20px 13px;
  background: linear-gradient(180deg, rgba(255,255,255,0.78), rgba(255,255,255,0.58));
  border: 1px solid rgba(255,255,255,0.76);
  box-shadow: 0 32px 96px -48px rgba(44,30,96,0.48), 0 8px 26px -22px rgba(124,92,255,0.36), inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(124,92,255,0.10);
  backdrop-filter: blur(22px) saturate(1.18);
  -webkit-backdrop-filter: blur(22px) saturate(1.18);
  overflow: hidden;
}
.hv2-kpi-band::before {
  content: '';
  position: absolute;
  inset: -1px;
  pointer-events: none;
  background:
    radial-gradient(620px 120px at 34% 0%, rgba(124,92,255,0.20), transparent 66%),
    radial-gradient(480px 130px at 82% 8%, rgba(255,255,255,0.72), transparent 70%),
    linear-gradient(90deg, rgba(255,255,255,0.38), transparent 28%, rgba(124,92,255,0.08), transparent 70%);
}
.hv2-kpi-inner {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 392px;
  gap: 22px;
  align-items: stretch;
}
.hv2-kpi-left {
  min-width: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 10px;
}
.hv2-trusted-row {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}
.hv2-trusted-label {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #9aa0ae;
}
.hv2-logo-row {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 17px;
  color: rgba(59,65,82,0.54);
  font-size: 13px;
  font-weight: 750;
}
.hv2-logo-mark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}
.hv2-logo-dot {
  width: 17px;
  height: 17px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(124,92,255,0.18), rgba(11,16,32,0.07));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.82);
}
.hv2-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  min-width: 0;
}
.hv2-kpi-card {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0,1fr);
  gap: 12px;
  align-items: center;
  padding: 6px 14px;
  border-left: 1px solid rgba(80,85,110,0.10);
}
.hv2-kpi-card:first-child { border-left: 0; padding-left: 0; }
.hv2-kpi-icon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: ${PURPLE};
  background: linear-gradient(135deg, rgba(124,92,255,0.18), rgba(124,92,255,0.07));
  border: 1px solid rgba(124,92,255,0.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.82), 0 12px 26px -20px rgba(124,92,255,0.56);
}
.hv2-kpi-value {
  display: block;
  font-size: 28px;
  font-weight: 850;
  color: ${DARK};
  line-height: .94;
  letter-spacing: -.04em;
  white-space: nowrap;
}
.hv2-kpi-value small {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -.01em;
}
.hv2-kpi-title {
  display: block;
  margin-top: 6px;
  font-size: 12.5px;
  font-weight: 800;
  color: #202637;
  white-space: nowrap;
}
.hv2-kpi-sub {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: #737b8d;
  white-space: nowrap;
}
.hv2-compliance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
.hv2-cert-card {
  min-width: 0;
  border-radius: 11px;
  padding: 8px 11px;
  background: linear-gradient(180deg, rgba(255,255,255,0.80), rgba(255,255,255,0.56));
  border: 1px solid rgba(124,92,255,0.13);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.92);
}
.hv2-cert-title {
  display: block;
  font-size: 13px;
  font-weight: 850;
  color: #22243a;
  line-height: 1;
  white-space: nowrap;
}
.hv2-cert-sub {
  display: block;
  margin-top: 6px;
  font-size: 8.8px;
  font-weight: 850;
  letter-spacing: .11em;
  color: #8b86a5;
  text-transform: uppercase;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .hv2-anim { animation: none !important; }
}
@media (max-width: 1080px) {
  .hv2-nav {
    grid-template-columns: 1fr auto !important;
    align-items: center !important;
    padding: 18px 28px 0 !important;
  }
  .hv2-nav-links,
  .hv2-nav-actions { display: none !important; }
  .hv2-menu-btn {
    display: inline-grid !important;
    place-items: center !important;
    width: 44px !important;
    height: 44px !important;
    border-radius: 12px !important;
    color: ${DARK} !important;
    background: rgba(255,255,255,0.72) !important;
    border: 1px solid rgba(80,85,110,0.14) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.9), 0 16px 34px -26px rgba(11,16,32,0.35) !important;
  }
  .hv2-mobile-menu {
    display: grid !important;
    position: absolute !important;
    top: 72px !important;
    left: 28px !important;
    right: 28px !important;
    z-index: 20 !important;
    gap: 6px !important;
    padding: 12px !important;
    border-radius: 18px !important;
    background: rgba(255,255,255,0.88) !important;
    border: 1px solid rgba(80,85,110,0.14) !important;
    box-shadow: 0 28px 80px -36px rgba(44,30,96,0.32), inset 0 1px 0 rgba(255,255,255,0.9) !important;
    backdrop-filter: blur(22px) saturate(1.25) !important;
    -webkit-backdrop-filter: blur(22px) saturate(1.25) !important;
  }
  .hv2-mobile-menu a {
    display: flex !important;
    min-height: 46px !important;
    align-items: center !important;
    justify-content: space-between !important;
    border-radius: 12px !important;
    padding: 0 14px !important;
    color: ${DARK} !important;
    font-size: 14px !important;
    font-weight: 650 !important;
    text-decoration: none !important;
  }
  .hv2-mobile-menu a:hover { background: rgba(124,92,255,0.08) !important; }
  .hv2-mobile-menu .hv2-mobile-demo {
    margin-top: 4px !important;
    justify-content: center !important;
    color: #fff !important;
    background: #070812 !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 18px 34px -24px rgba(11,16,32,0.72) !important;
  }
  .hv2-kpi-band {
    position: relative !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    width: calc(100% - 48px) !important;
    margin: 0 auto 24px !important;
  }
  .hv2-kpi-inner {
    grid-template-columns: 1fr !important;
  }
  .hv2-trusted-row {
    align-items: flex-start !important;
    flex-direction: column !important;
    gap: 10px !important;
  }
  .hv2-logo-row {
    flex-wrap: wrap !important;
    gap: 11px 15px !important;
  }
  .hv2-kpi-grid {
    grid-template-columns: repeat(2, minmax(0,1fr)) !important;
    gap: 12px !important;
  }
  .hv2-kpi-card {
    border-left: 0 !important;
    border-radius: 14px !important;
    padding: 12px !important;
    background: rgba(255,255,255,0.50) !important;
    border: 1px solid rgba(124,92,255,0.10) !important;
  }
  .hv2-compliance-grid {
    grid-template-columns: repeat(3, minmax(0,1fr)) !important;
  }
}
@media (max-width: 760px) {
  .hv2-nav {
    height: 68px !important;
    padding: 16px 22px 0 !important;
    display: flex !important;
    align-items: flex-start !important;
    justify-content: space-between !important;
    gap: 16px !important;
  }
  .hv2-mobile-menu { top: 66px !important; left: 18px !important; right: 18px !important; }
  .hv2-main {
    padding: 34px 22px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 34px !important;
  }
  .hv2-left {
    max-width: none !important;
    padding-top: 0 !important;
  }
  .hv2-title {
    font-size: clamp(44px, 14vw, 56px) !important;
    line-height: 1.02 !important;
  }
  .hv2-title span {
    white-space: normal !important;
  }
  .hv2-copy {
    max-width: 330px !important;
    font-size: 17px !important;
    line-height: 1.55 !important;
  }
  .hv2-actions {
    flex-wrap: wrap !important;
    gap: 12px !important;
  }
  .hv2-actions a {
    min-width: 154px !important;
    justify-content: center !important;
  }
  .hv2-trust { display: none !important; }
  .hv2-scene {
    min-height: 470px !important;
    overflow: visible !important;
  }
  .hv2-stage {
    width: 760px !important;
    max-width: none !important;
    min-height: auto !important;
    margin-left: -190px !important;
    transform: scale(0.72) !important;
    transform-origin: top center !important;
    padding-bottom: 90px !important;
  }
  .hv2-analysis {
    top: 18% !important;
    right: 14% !important;
  }
  .hv2-workflow {
    margin-left: -72px !important;
    width: 92% !important;
  }
  .hv2-report { display: none !important; }
  .hv2-kpi-band { width: calc(100% - 32px) !important; padding: 16px !important; }
  .hv2-kpi-grid { grid-template-columns: 1fr !important; }
  .hv2-compliance-grid { grid-template-columns: repeat(2, minmax(0,1fr)) !important; }
}
`;

// Item 2 — each floating layer gets its own depth plane via a unique, progressively
// softer/larger shadow (subtle elevation, not heavier blur).
const SHADOW = {
  analysis: '0 1px 3px rgba(20,14,50,0.04), 0 16px 34px -14px rgba(44,30,96,0.20), inset 0 1px 0 rgba(255,255,255,0.72)',
  timeline: '0 2px 5px rgba(20,14,50,0.04), 0 22px 46px -16px rgba(44,30,96,0.22), inset 0 1px 0 rgba(255,255,255,0.70)',
  report: '0 3px 8px rgba(20,14,50,0.05), 0 34px 68px -20px rgba(44,30,96,0.30), inset 0 1px 0 rgba(255,255,255,0.78)',
};
// Item 1 — premium glass for the viewer panel: layered ambient/key/contact shadows,
// a thin inner highlight + hairline border, and a faint bottom refraction tint.
const VIEWER_GLASS = '0 4px 8px rgba(20,14,50,0.07), 0 26px 52px -14px rgba(44,30,96,0.26), 0 74px 140px -40px rgba(44,30,96,0.48), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 0 0 1px rgba(255,255,255,0.58), inset 0 -26px 48px -28px rgba(120,92,220,0.13)';

function HeroNav() {
  const [open, setOpen] = useState(false);
  const nav = [
    { label: 'Platform', href: '#platform' },
    { label: 'Solutions', href: '/solutions' },
    { label: 'Resources', href: '#resources' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Compliance', href: '/compliance' },
    { label: 'Support', href: '/contact' },
  ];

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <nav className="hv2-nav" style={{
      position: 'relative', zIndex: 5, width: '100%', maxWidth: 1536, margin: '0 auto',
      height: 80, padding: '18px 48px 0', display: 'grid', gridTemplateColumns: '220px 1fr 280px',
      alignItems: 'start', gap: 24,
    }}>
      <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 13, color: DARK, textDecoration: 'none' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <circle key={i} cx={4 + (i % 4) * 6.4} cy={4 + Math.floor(i / 4) * 6.4} r="2.1" fill={PURPLE} />
          ))}
        </svg>
        <span style={{ fontSize: 25, fontWeight: 500, letterSpacing: '-0.02em' }}>Osieri</span>
      </a>
      <div className="hv2-nav-links" style={{ display: 'flex', justifyContent: 'center', gap: 52, paddingTop: 8, fontSize: 13.5, color: '#22263a' }}>
        {nav.map((item) => (
          <a key={item.label} href={item.href} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 500 }}>
            {item.label}
          </a>
        ))}
      </div>
      <div className="hv2-nav-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 28 }}>
        <a href="/login" style={{ color: DARK, textDecoration: 'none', fontSize: 13.5, fontWeight: 500, paddingTop: 8 }}>Sign in</a>
        <a href="/book-demo" className="hv2-cta" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 18, height: 42, padding: '0 20px',
          borderRadius: 10, background: '#070812', color: '#fff', fontWeight: 650, fontSize: 13.5, textDecoration: 'none',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 14px 34px -18px rgba(11,16,32,0.72)',
        }}>
          Request a demo <ArrowRight size={22} strokeWidth={1.7} className="hv2-arrow" />
        </a>
      </div>
      <button
        type="button"
        className="hv2-menu-btn"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={21} strokeWidth={1.8} /> : <Menu size={21} strokeWidth={1.8} />}
      </button>
      {open && (
        <div className="hv2-mobile-menu">
          {nav.map((item) => (
            <a key={item.label} href={item.href} onClick={() => setOpen(false)}>
              {item.label}
              <ArrowRight size={16} strokeWidth={1.8} />
            </a>
          ))}
          <a href="/login" onClick={() => setOpen(false)}>Sign in</a>
          <a href="/book-demo" className="hv2-mobile-demo" onClick={() => setOpen(false)}>
            Request a demo <ArrowRight size={18} strokeWidth={1.8} />
          </a>
        </div>
      )}
    </nav>
  );
}

// Count a metric up from 0 → target, once, shortly after mount. The metrics live
// in the hero (visible on load), so we trigger on mount rather than on-scroll —
// which is both reliable and matches "count upward once when visible".
function CountUp({ to, decimals = 0, prefix = '', suffix = '', duration = 1.5, delay = 0.25 }: {
  to: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; delay?: number;
}) {
  const reduced = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (reduced) { setVal(to); return; }
    let raf = 0; let startT = 0;
    const timer = setTimeout(() => {
      const tick = (now: number) => {
        if (!startT) startT = now;
        const p = Math.min(1, (now - startT) / (duration * 1000));
        setVal(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [reduced, to, duration, delay]);
  return <span>{prefix}{val.toFixed(decimals)}{suffix}</span>;
}

// A weightless floating wrapper (independent duration/delay per instance).
function Float({ children, dur = 15, delay = 0, style, className }: {
  children?: React.ReactNode; dur?: number; delay?: number; style?: React.CSSProperties; className?: string;
}) {
  return (
    <div className={`hv2-anim${className ? ` ${className}` : ''}`} style={{ animation: `hv2-float ${dur}s ease-in-out ${delay}s infinite`, ...style }}>
      {children}
    </div>
  );
}

export function HeroV2() {
  const reduced = useReducedMotion();

  // ── Layered cursor parallax (INTERPOLATED) ── writes --px/--py (-1..1) on the
  // scene, eased toward the pointer via a rAF lerp so motion never snaps; each
  // depth layer multiplies it by a different px amount. Skipped under reduced-motion.
  const sceneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    let inView = false;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const loop = () => {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      el.style.setProperty('--px', cx.toFixed(4));
      el.style.setProperty('--py', cy.toFixed(4));
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && inView) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (inView) start();
      else stop();
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    io.observe(el);
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // ── "AI is working" state ── the workflow advances L→R and loops, diagnostic
  // confidence drifts 90→92, and the detection labels cycle. Slow + subtle; all
  // frozen under reduced-motion.
  const [activeStep, setActiveStep] = useState(2);
  const [confidence, setConfidence] = useState(92);
  const [labelPhase, setLabelPhase] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const stepId = setInterval(() => setActiveStep((s) => (s + 1) % 6), 2200);
    const conf = [90, 91, 92, 91, 92]; let ci = 0;
    const confId = setInterval(() => { ci = (ci + 1) % conf.length; setConfidence(conf[ci]); }, 2600);
    const labelId = setInterval(() => setLabelPhase((p) => (p + 1) % 3), 3800);
    return () => { clearInterval(stepId); clearInterval(confId); clearInterval(labelId); };
  }, [reduced]);

  const steps = [
    { label: 'Specimen', sub: 'Collected', Icon: FlaskConical },
    { label: 'Digitization', sub: 'Complete', Icon: Layers },
    { label: 'AI Analysis', sub: 'In Progress', Icon: Brain },
    { label: 'Pathologist Review', sub: 'Pending', Icon: UserRound },
    { label: 'Report', sub: 'Generating', Icon: FileText },
    { label: 'Diagnosis', sub: 'Delivered', Icon: CheckCircle2 },
  ];

  // Concept-illustration region labels only — neutral microscopy descriptors, no
  // AI detection, diagnosis, or confidence (Program 1 · P1-1b). The product does not
  // analyze slide pixels; see the persistent disclaimer in the panel below.
  const detections = [
    { top: '20%', left: '54%', w: '15%', h: '20%', delay: 0.2, labels: ['Field of view', 'Field of view', 'Field of view'] },
    { top: '10%', left: '40%', w: '9%', h: '13%', delay: 0.9, labels: ['Cell field', 'Cell field', 'Cell field'] },
    { top: '46%', left: '18%', w: '11%', h: '16%', delay: 1.5, labels: ['Stromal field', 'Stromal field', 'Stromal field'] },
    { top: '58%', left: '68%', w: '12%', h: '15%', delay: 2.1, labels: ['Cell cluster', 'Cell cluster', 'Cell cluster'] },
  ];

  // Real workflow stages (not image analysis).
  const analysisRows = [
    { label: 'Specimen accessioned', done: true },
    { label: 'Case assembled', done: true },
    { label: 'Structured report drafted', done: true },
    { label: 'Awaiting pathologist sign-out', done: false },
  ];

  const tools = [Hand, Scan, Brush, Circle, Plus, Minus];

  // Deterministic nuclei-segmentation mask over the main tumour cluster — thin
  // outlines, phyllotaxis-spread so they read as per-nucleus AI segmentation
  // (no Math.random → SSR-safe, stable render). viewBox is 300 × 200.
  const nuclei = Array.from({ length: 20 }, (_, i) => {
    const a = i * 2.399963;
    const r = 9 + (i % 6) * 4.2;
    return {
      cx: 201 + Math.cos(a) * r, cy: 112 + Math.sin(a) * (r * 0.68),
      rx: 2.3 + (i % 3) * 0.9, ry: 1.9 + (i % 2) * 0.8, delay: 1.3 + i * 0.05,
    };
  });

  return (
    <section style={{
      position: 'relative', minHeight: '100vh', overflow: 'hidden',
      fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
      background: '#FAFAFB', display: 'flex', flexDirection: 'column',
    }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <HeroNav />

      {/* ── ONE environment — layered Apple-keynote light, no hard edges ── */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* base wash: warm-white → cool-white → pale lavender */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #FFFFFF 0%, #FDFCFF 42%, #F7F5FE 78%, #F3F1FB 100%)' }} />
        {/* warm-white key (upper-left) */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 55% at 12% 6%, rgba(255,255,255,0.9) 0%, transparent 60%)' }} />
        {/* pale-lavender bloom behind the artwork (upper-right) — kept faint */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(52% 55% at 82% 20%, rgba(124,92,255,0.06) 0%, transparent 62%)' }} />
        {/* very soft gray floor */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(80% 46% at 60% 118%, rgba(120,124,140,0.08) 0%, transparent 60%)' }} />
        {/* continuous environment bloom connecting viewer → workflow → report */}
        <div style={{ position: 'absolute', left: '42%', right: '-8%', top: '34%', height: '58%', background: 'radial-gradient(ellipse 70% 54% at 52% 24%, rgba(124,92,255,0.13), transparent 62%), radial-gradient(ellipse 62% 42% at 58% 70%, rgba(190,170,255,0.16), transparent 66%)', filter: 'blur(10px)' }} />
        <div style={{ position: 'absolute', left: '34%', right: '0%', bottom: '-8%', height: '34%', background: 'radial-gradient(ellipse 70% 80% at 58% 0%, rgba(255,255,255,0.72), rgba(228,224,255,0.22) 44%, transparent 76%)' }} />
        <div style={{ position: 'absolute', left: '48%', top: '44%', width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.09), transparent 66%)', filter: 'blur(2px)' }} />
        {/* large diagonal volumetric light rays — felt, not seen */}
        <div style={{ position: 'absolute', top: '-40%', left: '18%', width: '30%', height: '200%', transform: 'rotate(20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.38), transparent)' }} />
        <div style={{ position: 'absolute', top: '-40%', left: '52%', width: '26%', height: '200%', transform: 'rotate(20deg)', background: 'linear-gradient(90deg, transparent, rgba(238,234,255,0.28), transparent)' }} />
      </div>

      {/* ── main grid (reference-proportioned hero composition) ── */}
      <div className="hv2-main" style={{
        flex: 1, position: 'relative', zIndex: 1, width: '100%', maxWidth: 1600, margin: '0 auto',
        padding: '24px 48px 0', display: 'grid', gridTemplateColumns: '41% 59%', gap: 36, alignItems: 'start',
      }}>
        {/* ══════════ LEFT COLUMN ══════════ */}
        <div className="hv2-left" style={{ maxWidth: 610, paddingTop: 46 }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: PURPLE,
              background: 'transparent', border: 0, padding: 0, borderRadius: 0,
            }}>
              AI-Assisted Pathology
            </span>

            {/* "Three lines exactly" — the binding line is "Cellular intelligence."
                (21 chars); at a 580px column that caps the size ~56px, so the
                literal 72px spec would force a wrap. We honor the 3-line hierarchy
                (and the visual target, which is ~56px) with nowrap per line. */}
            <h1 className="hv2-title" style={{ margin: '36px 0 0', fontFamily: 'Georgia, "Times New Roman", "Times", serif', fontWeight: 500, fontSize: 'clamp(52px, 4.7vw, 68px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: DARK }}>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>Unified pathology.</span>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>One platform.</span>
              <span style={{ display: 'block', whiteSpace: 'nowrap', color: PURPLE }}>Cellular intelligence.</span>
            </h1>

            <p className="hv2-copy" style={{ margin: '34px 0 0', maxWidth: 470, fontSize: 17, lineHeight: 1.55, color: '#4f5668', fontWeight: 400 }}>
              PathOS unifies every step of the diagnostic journey. From specimen to
              signed report—powered by purpose-built AI.
            </p>

            <div className="hv2-actions" style={{ display: 'flex', gap: 16, marginTop: 38, alignItems: 'center' }}>
              <a href="/book-demo" className="hv2-cta" style={{
                display: 'inline-flex', alignItems: 'center', gap: 18, height: 54, padding: '0 24px',
                borderRadius: 10, background: '#070812', color: '#fff', fontWeight: 650, fontSize: 14, textDecoration: 'none',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16), 0 18px 34px -22px rgba(11,16,32,0.7)',
              }}>
                Request a demo <ArrowRight size={22} strokeWidth={1.7} className="hv2-arrow" />
              </a>
              <a href="#platform" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, height: 54, padding: '0 28px',
                borderRadius: 10, background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(80,85,110,0.18)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)', color: DARK, fontWeight: 600, fontSize: 14, textDecoration: 'none',
              }}>
                Explore the platform
              </a>
            </div>

          </motion.div>
        </div>

        {/* ══════════ RIGHT COLUMN — diagnostic-journey scene ══════════ */}
        <div ref={sceneRef} className="hv2-scene hv2-anim" style={{ position: 'relative', minHeight: 'max(760px, calc(100vh - 72px))', animation: 'hv2-herofloat 18s ease-in-out infinite' }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 0.8, 0.2, 1], delay: 0.15 }}
            className="hv2-stage"
            style={{ position: 'relative', width: '106%', maxWidth: 1040, minHeight: 'max(760px, calc(100vh - 84px))', marginLeft: 54, perspective: 1700, paddingBottom: 190 }}
          >
            {/* ── atmospheric depth behind the slide ── soft out-of-focus tissue
                bokeh (real depth layers, NOT stronger gradients). Drifts OPPOSITE
                the cursor for parallax depth; sits behind the glass (negative z). */}
            <div aria-hidden style={{ position: 'absolute', inset: '-10% -8% -14% -8%', zIndex: -1, pointerEvents: 'none',
              transform: 'translate(calc(var(--px,0) * -7px), calc(var(--py,0) * -5px))', willChange: 'transform' }}>
              <Float dur={18} style={{ position: 'absolute', top: '4%', left: '0%', width: 190, height: 190, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.12) 0%, transparent 70%)' }} />
              <Float dur={23} delay={1.3} style={{ position: 'absolute', top: '42%', right: '-2%', width: 230, height: 230, borderRadius: '50%', background: 'radial-gradient(circle, rgba(178,120,224,0.10) 0%, transparent 70%)' }} />
              <Float dur={20} delay={0.7} style={{ position: 'absolute', bottom: '0%', left: '22%', width: 210, height: 210, borderRadius: '50%', background: 'radial-gradient(circle, rgba(150,150,255,0.10) 0%, transparent 70%)' }} />
              <Float dur={26} delay={2.0} style={{ position: 'absolute', top: '20%', left: '40%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(206,166,240,0.09) 0%, transparent 70%)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', left: '-13%', right: '-8%', top: '44%', height: 430, zIndex: -1, pointerEvents: 'none',
              background: 'radial-gradient(ellipse 68% 48% at 54% 10%, rgba(255,255,255,0.78), rgba(236,232,255,0.30) 42%, transparent 74%), radial-gradient(ellipse 82% 36% at 44% 68%, rgba(124,92,255,0.10), transparent 70%)',
              filter: 'blur(3px)' }} />

            {/* ── main slide (floating, soft perspective, white glass frame) ──
                wrapped in a parallax layer that follows the cursor (foreground). */}
            <div style={{ transform: 'translate(calc(var(--px,0) * 2.5px), calc(var(--py,0) * 1.7px))', willChange: 'transform' }}>
            <Float dur={17} style={{ transformStyle: 'preserve-3d' }}>
              <div style={{
                position: 'relative', transform: 'rotateX(3deg) rotateY(-7deg) rotate(-4deg)', transformOrigin: 'center',
                borderRadius: 22, overflow: 'hidden', ...glass, boxShadow: VIEWER_GLASS,
                padding: 6,
              }}>
                {/* very soft glass glare + edge reflection (subtle, never glossy) */}
                <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 22, zIndex: 8, pointerEvents: 'none',
                  background: 'linear-gradient(133deg, rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.06) 22%, transparent 46%)' }} />
                {/* faint edge reflection running along the top-left rim */}
                <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: '52%', height: 2, borderRadius: 22, zIndex: 8, pointerEvents: 'none',
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.85), transparent)' }} />
                <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 22, zIndex: 8, pointerEvents: 'none',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 1px 1px rgba(255,255,255,0.8)' }} />
                <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', aspectRatio: '3 / 2', background: '#f3eefb' }}>
                  {/* tissue — H&E stained (pale pink cytoplasm, dark violet nuclei) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/cytology-sample.png" alt="Digital pathology slide" className="hv2-anim" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: HE_FILTER, transform: 'scale(1.18)', transformOrigin: '56% 45%', animation: 'hv2-microdrift 18s ease-in-out infinite', willChange: 'transform' }} />
                  {/* clear-background lift — adds white space between cells so the
                      slide reads as a real H&E section rather than a solid stain */}
                  <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,251,254,0.20) 0%, rgba(255,249,253,0.10) 52%, rgba(255,248,252,0.16) 100%)' }} />
                  {/* eosin warmth — nudges cytoplasm/background toward authentic pale
                      pink via soft-light (leaves the dark hematoxylin nuclei violet) */}
                  <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(245,150,182,0.34)', mixBlendMode: 'soft-light' }} />

                  {/* heat map soft growth */}
                  <div className="hv2-anim" aria-hidden style={{
                    position: 'absolute', top: '18%', left: '46%', width: '34%', height: '46%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(124,92,255,0.5) 0%, rgba(124,92,255,0.12) 45%, transparent 72%)',
                    mixBlendMode: 'screen', filter: 'blur(6px)', animation: 'hv2-heat 6s ease-in-out infinite',
                  }} />

                  {/* AI detection boxes — drift with the AI overlay layer and softly
                      pulse continuously, as if actively detecting regions */}
                  {detections.map((d, i) => {
                    const driftDur = 13 + (i % 3) * 3;  // 13–19s, varied
                    const pulseDur = 3.2 + (i % 2) * 0.9;             // 3.2–4.1s
                    return (
                      <div key={i} className="hv2-anim"
                        style={{ position: 'absolute', top: d.top, left: d.left, width: d.w, height: d.h, zIndex: 3, animation: `${i % 2 ? 'hv2-drift2' : 'hv2-drift'} ${driftDur}s ease-in-out ${(i * 0.8).toFixed(1)}s infinite`, willChange: 'transform' }}>
                        <div className="hv2-anim" style={{
                          position: 'absolute', inset: 0, borderRadius: 6, border: `1.5px solid ${PURPLE}`,
                          boxShadow: '0 0 0 1px rgba(124,92,255,0.25), 0 0 14px rgba(124,92,255,0.35)',
                          background: 'rgba(124,92,255,0.06)', opacity: 0.7,
                          animation: `hv2-boxpulse ${pulseDur.toFixed(1)}s ease-in-out ${(i * 0.5).toFixed(1)}s infinite`,
                        }} />
                        <motion.span key={d.labels[labelPhase]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.65 }}
                          style={{
                          position: 'absolute', top: -20, left: 0, fontSize: 10, fontWeight: 700, color: '#fff',
                          background: PURPLE, padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                          boxShadow: '0 4px 10px rgba(124,92,255,0.4)',
                        }}>{d.labels[labelPhase]}</motion.span>
                      </div>
                    );
                  })}

                  {/* signature scan line — sweeps down in ~2s, then rests ~7s */}
                  <div className="hv2-anim" aria-hidden style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: '8%', zIndex: 4, opacity: 0,
                    background: 'linear-gradient(180deg, rgba(150,120,255,0) 0%, rgba(150,120,255,0.14) 60%, rgba(185,165,255,0.5) 100%)',
                    borderBottom: '1px solid rgba(175,155,255,0.7)',
                    animation: 'hv2-scanline 9s cubic-bezier(0.4,0,0.2,1) infinite',
                  }} />

                  {/* AI DETECTION pill on the tissue */}
                  <div style={{
                    position: 'absolute', top: '14%', left: '30%', zIndex: 5, display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(11,16,32,0.82)', padding: '4px 9px', borderRadius: 999,
                    letterSpacing: '0.06em',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: PURPLE }} /> AI DETECTION
                  </div>

                  {/* ── nuclei segmentation mask (per-cell AI outlines) — appears
                      with the scan pass over the central cluster ── */}
                  <svg aria-hidden viewBox="0 0 300 200" preserveAspectRatio="none" className="hv2-anim"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none', mixBlendMode: 'screen', animation: 'hv2-drift 15s ease-in-out infinite', willChange: 'transform' }}>
                    {nuclei.map((n, i) => {
                      const dur = 5.5 + (i % 5) * 0.9;          // 5.5–9.1s
                      const delay = ((i * 1.37) % 6).toFixed(2); // spread so only a few show at once
                      return (
                        <ellipse key={i} className="hv2-anim" cx={n.cx} cy={n.cy} rx={n.rx} ry={n.ry}
                          fill="rgba(150,120,255,0.10)" stroke="rgba(168,140,255,0.95)" strokeWidth="0.7"
                          style={{ opacity: 0.4, animation: `hv2-nuc ${dur.toFixed(1)}s ease-in-out ${delay}s infinite` }} />
                      );
                    })}
                  </svg>

                  {/* ── region-of-interest selection (marquee + handles + area) ── */}
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1.0 }}
                    style={{ position: 'absolute', top: '28%', left: '44%', width: '34%', height: '48%', zIndex: 4,
                      border: '1.4px dashed rgba(124,92,255,0.9)', borderRadius: 4, background: 'rgba(124,92,255,0.05)' }}>
                    {/* soft highlight that only appears as the scan crosses the ROI */}
                    <div className="hv2-anim" aria-hidden style={{ position: 'absolute', inset: -1, borderRadius: 5, opacity: 0,
                      background: 'rgba(124,92,255,0.10)', boxShadow: '0 0 0 1px rgba(124,92,255,0.55), 0 0 16px rgba(124,92,255,0.32)',
                      animation: 'hv2-region 9s cubic-bezier(0.4,0,0.2,1) 0.55s infinite' }} />
                    {[['-3px', '-3px'], ['-3px', 'auto', '-3px'], ['auto', '-3px', 'auto', '-3px'], ['auto', 'auto', '-3px', '-3px']].map((_, i) => (
                      <span key={i} style={{
                        position: 'absolute', width: 6, height: 6, background: '#fff', border: `1.5px solid ${PURPLE}`, borderRadius: 1,
                        top: i < 2 ? -3 : 'auto', bottom: i >= 2 ? -3 : 'auto', left: i % 2 === 0 ? -3 : 'auto', right: i % 2 === 1 ? -3 : 'auto',
                      }} />
                    ))}
                    <span style={{ position: 'absolute', top: -19, left: 0, fontSize: 9.5, fontWeight: 700, color: PURPLE, background: 'rgba(255,255,255,0.9)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                      Region 1 · 2.4 mm²
                    </span>
                  </motion.div>

                  {/* ── magnification readout (top-left, clear of the Analysis card) ── */}
                  <div style={{
                    position: 'absolute', top: 12, left: 74, zIndex: 6, fontSize: 11, fontWeight: 800, color: DARK,
                    background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(255,255,255,0.6)',
                    padding: '4px 9px', borderRadius: 8, letterSpacing: '-0.01em',
                  }}>40× · 0.25 µm/px</div>

                  {/* ── scale bar (bottom-right) ── */}
                  <div style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                    <div style={{ width: 48, height: 3, background: '#fff', borderRadius: 2, boxShadow: '0 0 0 1px rgba(11,16,32,0.25)' }} />
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>50 µm</span>
                  </div>
                </div>

                {/* left toolbar */}
                <div style={{
                  position: 'absolute', top: 26, left: 24, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 6,
                  ...glass, borderRadius: 12, padding: 6,
                }}>
                  {tools.map((Icon, i) => (
                    <span key={i} style={{
                      width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center',
                      color: i === 0 ? PURPLE : GRAY, background: i === 0 ? 'rgba(124,92,255,0.10)' : 'transparent',
                    }}>
                      <Icon size={15} />
                    </span>
                  ))}
                </div>

                {/* slide minimap / overview with the current-viewport rectangle */}
                <div style={{
                  position: 'absolute', bottom: 24, left: 24, width: 86, height: 60, borderRadius: 10, zIndex: 6, ...glass, padding: 4,
                }}>
                  <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 7, overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/cytology-sample.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: HE_FILTER }} />
                    {/* current viewport rectangle (mirrors the region marquee) */}
                    <div style={{ position: 'absolute', top: '26%', left: '40%', width: '34%', height: '48%',
                      border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(124,92,255,0.9), 0 0 6px rgba(124,92,255,0.5)', borderRadius: 2, background: 'rgba(124,92,255,0.10)' }} />
                  </div>
                  <span style={{ position: 'absolute', top: -15, left: 2, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', color: GRAY }}>OVERVIEW</span>
                </div>
              </div>
            </Float>
            </div>

            {/* ── floating Analysis card (top-right) ── */}
            <Float className="hv2-analysis" dur={14} delay={0.6} style={{ position: 'absolute', top: '16%', right: '22%', width: 252, zIndex: 10, translate: 'calc(var(--px,0) * 14px) calc(var(--py,0) * 9.5px)' }}>
              <div style={{ ...glass, borderRadius: 18, padding: 16, boxShadow: SHADOW.analysis }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 8, background: 'rgba(124,92,255,0.12)', display: 'grid', placeItems: 'center', color: PURPLE }}>
                    <Brain size={14} />
                  </span>
                  <span style={{ fontWeight: 750, fontSize: 14, color: DARK }}>AI Analysis</span>
                </div>
                {analysisRows.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(11,16,32,0.04)', fontSize: 12.5, color: '#2f3548' }}>
                    <span>{r.label}</span>
                    {r.done
                      ? <Check size={15} color={PURPLE} strokeWidth={3} />
                      : <RefreshCw size={13} color={GRAY} className={reduced ? undefined : 'hv2-anim'} style={{ animation: reduced ? undefined : 'spin 2.4s linear infinite' }} />}
                  </div>
                ))}
                <div style={{ marginTop: 18, marginBottom: 4, fontSize: 11, color: GRAY, lineHeight: 1.45 }}>
                  Concept illustration — no slide-image analysis is performed.
                </div>
              </div>
            </Float>

            {/* ── workflow ── six individual glass cards (one per stage) connected
                by a lit line + glowing dots above them; the active stage glows and a
                soft pulse travels the connector once per ~9s analysis cycle. */}
            <Float className="hv2-workflow" dur={16} delay={0.3} style={{ position: 'relative', marginTop: -214, marginLeft: -8, width: '96%', zIndex: 9, translate: 'calc(var(--px,0) * 6px) calc(var(--py,0) * 3.6px)' }}>
              <div aria-hidden style={{
                position: 'absolute', inset: '-22px -16px -24px', borderRadius: 26, zIndex: 0,
                background: 'linear-gradient(180deg, rgba(255,255,255,0.76), rgba(255,255,255,0.58))',
                border: '1px solid rgba(255,255,255,0.66)', boxShadow: '0 34px 110px -42px rgba(44,30,96,0.38), 0 8px 32px -26px rgba(124,92,255,0.36), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(124,92,255,0.10)',
              }} />
              <div aria-hidden style={{ position: 'absolute', left: '10%', right: '8%', top: -48, height: 86, borderRadius: '50%', zIndex: 0, background: 'radial-gradient(ellipse 50% 70% at 50% 50%, rgba(124,92,255,0.22), transparent 68%)', filter: 'blur(10px)' }} />
              <div aria-hidden style={{ position: 'absolute', left: '4%', right: '4%', top: -20, height: 1, zIndex: 3, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.96), rgba(124,92,255,0.34), transparent)' }} />
              {/* connector line + glowing dots, sitting above the card row */}
              <div aria-hidden style={{ position: 'absolute', top: 6, left: 'calc((100% / 6) / 2)', right: 'calc((100% / 6) / 2)', height: 2, background: 'rgba(150,120,255,0.24)', borderRadius: 2, zIndex: 2, boxShadow: '0 0 18px rgba(124,92,255,0.16)' }}>
                <motion.div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, #9d86ff, ${PURPLE})` }}
                  animate={{ width: `${(activeStep / 5) * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 0.8, 0.2, 1] }} />
                <div className="hv2-anim" aria-hidden style={{ position: 'absolute', top: -6, left: 0, width: 15, height: 15, marginLeft: -7.5, borderRadius: '50%', opacity: 0,
                  background: 'radial-gradient(circle, rgba(190,172,255,1) 0%, rgba(160,138,255,0.6) 42%, transparent 72%)',
                  boxShadow: '0 0 16px rgba(150,120,255,1)', animation: 'hv2-travel 9s cubic-bezier(0.4,0,0.2,1) infinite' }} />
                {steps.map((s, i) => {
                  const lit = i <= activeStep;
                  return (
                    <div key={i} aria-hidden style={{ position: 'absolute', top: -3, left: `${(i / 5) * 100}%`, width: 8, height: 8, marginLeft: -4, borderRadius: '50%',
                      background: lit ? PURPLE : 'rgba(120,124,140,0.35)', boxShadow: lit ? '0 0 8px rgba(124,92,255,0.7)' : 'none', transition: 'all 0.4s ease' }} />
                  );
                })}
              </div>
              {/* the six stage cards */}
              <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 26, marginTop: 25, padding: '0 12px' }}>
                {steps.map((s, i) => {
                  const on = i === activeStep;
                  return (
                    <div key={s.label} className={on && !reduced ? 'hv2-anim' : undefined} style={{
                      ...glass, borderRadius: 14, minHeight: 118, padding: '21px 8px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center',
                      background: on ? 'linear-gradient(180deg, rgba(124,92,255,0.14), rgba(255,255,255,0.72))' : 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.66))',
                      border: on ? '1px solid rgba(124,92,255,0.42)' : '1px solid rgba(255,255,255,0.72)',
                      boxShadow: on ? '0 16px 38px -14px rgba(124,92,255,0.56), 0 0 0 1px rgba(124,92,255,0.12), inset 0 1px 0 rgba(255,255,255,0.84)' : '0 16px 42px -22px rgba(44,30,96,0.26), inset 0 1px 0 rgba(255,255,255,0.86)',
                      transform: on ? 'scale(1.02)' : 'scale(1)',
                      animation: on && !reduced ? 'hv2-active 2.2s ease-in-out infinite' : undefined,
                      transition: 'transform 0.45s cubic-bezier(0.22,0.8,0.2,1), background 0.45s ease, border-color 0.45s ease',
                    }}>
                      <s.Icon size={22} color={on ? PURPLE : GRAY} strokeWidth={1.75} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: on ? DARK : '#4a4f5c', lineHeight: 1.15 }}>{s.label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: on ? PURPLE : '#a2a7b3' }}>{s.sub}</span>
                    </div>
                  );
                })}
              </div>
            </Float>

            {/* ── report card ── raised to overlap the workflow panel slightly, so it
                reads as the OUTPUT of the workflow (highest depth plane) ── */}
            <Float className="hv2-report" dur={15} delay={1.1} style={{ position: 'absolute', bottom: 184, right: '8%', width: 530, zIndex: 11, translate: 'calc(var(--px,0) * 10px) calc(var(--py,0) * 6px)' }}>
              <div style={{ ...glass, borderRadius: 24, padding: '14px 24px', background: 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.58))', border: '1px solid rgba(255,255,255,0.72)', boxShadow: '0 44px 110px -46px rgba(44,30,96,0.44), 0 12px 34px -26px rgba(124,92,255,0.28), inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(124,92,255,0.08)', display: 'grid', gridTemplateColumns: '1fr 150px', gap: 22, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
                <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: '40%', height: 1, background: 'linear-gradient(90deg, rgba(255,255,255,0.95), transparent)' }} />
                <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(126deg, rgba(255,255,255,0.18), transparent 44%)', pointerEvents: 'none' }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 750, color: DARK, fontStyle: 'italic', letterSpacing: '-0.02em' }}>Report Preview</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: PURPLE, background: 'rgba(124,92,255,0.1)', padding: '2px 8px', borderRadius: 999 }}>Draft</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>Invasive Ductal Carcinoma</div>
                  <div style={{ fontSize: 12, color: GRAY, marginTop: 3 }}>Nottingham Grade 2</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {['ER Positive', 'PR Positive', 'HER2 Negative'].map((t) => (
                      <span key={t} style={{ fontSize: 11, fontWeight: 650, color: '#2f3548', background: 'rgba(124,92,255,0.10)', padding: '5px 10px', borderRadius: 7 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid rgba(11,16,32,0.09)', paddingLeft: 24, minHeight: 86, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ height: 38, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 32, fontStyle: 'italic', color: DARK, opacity: 0.78, lineHeight: 1 }}>James</div>
                  <div style={{ height: 1, background: 'rgba(11,16,32,0.14)', margin: '2px 0 8px' }} />
                  <div style={{ fontSize: 12, color: '#7a8090', lineHeight: 1.35 }}>Pathologist</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#7a8090', lineHeight: 1.35 }}>
                    Board Certified <ShieldCheck size={12} color={PURPLE} />
                  </div>
                </div>
              </div>
            </Float>
          </motion.div>
        </div>
      </div>
      <HeroKpiBand />
    </section>
  );
}

function HeroKpiBand() {
  const metrics = [
    { Icon: Target, to: 99.9, decimals: 1, suffix: '%', title: 'Diagnostic Accuracy', sub: 'Across all specimen classes' },
    { Icon: Timer, to: 2.0, decimals: 1, suffix: '', title: 'Average Review Time', sub: 'Hours from scan to review', unit: 'hrs' },
    { Icon: Building2, to: 500, suffix: '+', title: 'Partner Laboratories', sub: 'Worldwide pathology network' },
    { Icon: FileText, to: 12.8, decimals: 1, suffix: 'M+', title: 'Slides Processed', sub: 'Annually across PathOS' },
  ];

  const certs = [
    ['HIPAA', 'Aligned'],
    ['SOC2', 'Roadmap'],
    ['CLIA', 'Roadmap'],
    ['CAP', 'Roadmap'],
    ['FDA', 'Roadmap'],
    ['AES-256', 'Encryption'],
    ['RBAC', 'Policy'],
    ['Audit Trail', 'Enabled'],
    ['Zero Trust', 'Security'],
  ];

  return (
    <div className="hv2-kpi-band" aria-label="Enterprise trust, scale, and compliance">
      <div className="hv2-kpi-inner">
        <div className="hv2-kpi-left">
          <div className="hv2-trusted-row">
            <span className="hv2-trusted-label">Trusted by leading pathology teams</span>
            <div className="hv2-logo-row" aria-label="Representative laboratory teams">
              {['Mayo Clinic', 'Cleveland Clinic', 'Labcorp', 'Quest Diagnostics'].map((name) => (
                <span key={name} className="hv2-logo-mark">
                  <span className="hv2-logo-dot" aria-hidden />
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div className="hv2-kpi-grid">
            {metrics.map((m) => (
              <div key={m.title} className="hv2-kpi-card">
                <span className="hv2-kpi-icon"><m.Icon size={21} strokeWidth={1.85} /></span>
                <span>
                  <span className="hv2-kpi-value">
                    <CountUp to={m.to} decimals={m.decimals} suffix={m.suffix} />{m.unit && <small> {m.unit}</small>}
                  </span>
                  <span className="hv2-kpi-title">{m.title}</span>
                  <span className="hv2-kpi-sub">{m.sub}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="hv2-compliance-grid" aria-label="Enterprise compliance controls">
          {certs.map(([title, sub]) => (
            <div key={title} className="hv2-cert-card">
              <span className="hv2-cert-title">{title}</span>
              <span className="hv2-cert-sub">{sub}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default HeroV2;
