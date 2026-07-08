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
import { motion, useInView, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Play, Hand, Scan, Brush, Circle, Plus, Minus, Check, RefreshCw,
  FlaskConical, Layers, Brain, UserRound, FileText, CheckCircle2, ShieldCheck,
  Target, Timer, Building2,
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
  background: 'rgba(255,255,255,0.68)',
  backdropFilter: 'blur(24px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
  border: '1px solid rgba(255,255,255,0.55)',
  boxShadow: '0 24px 60px -20px rgba(11,16,32,0.18), 0 4px 14px -6px rgba(11,16,32,0.08)',
};

// ── ambient keyframes (CSS transforms → cheap, 60fps; disabled under RM) ──────
const KEYFRAMES = `
@keyframes hv2-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
/* AI scan pass — a thin lavender line sweeps top→bottom in ~2s, then ~7s rest
   (≈9s cycle). Faint but a touch stronger — calm analysis, not a sci-fi laser. */
@keyframes hv2-scanline { 0% { transform: translateY(-120%); opacity: 0; } 3% { opacity: .62; } 19% { opacity: .62; } 22% { transform: translateY(1010%); opacity: 0; } 100% { transform: translateY(1010%); opacity: 0; } }
/* AI overlays rest gently present, illuminate as the scan passes, settle back */
@keyframes hv2-idle { 0% { opacity: .34; } 6% { opacity: 1; } 20% { opacity: 1; } 36% { opacity: .34; } 100% { opacity: .34; } }
/* region-of-interest highlight — a soft glow that only appears during the pass */
@keyframes hv2-region { 0% { opacity: 0; } 7% { opacity: 1; } 22% { opacity: 1; } 42% { opacity: 0; } 100% { opacity: 0; } }
/* workflow pulse — travels the connector L→R ONCE per cycle, just after the scan,
   so the whole hero performs one complete analysis loop every ~9s */
@keyframes hv2-travel { 0%,20% { left: 0%; opacity: 0; } 25% { opacity: 1; } 52% { left: 100%; opacity: 1; } 57% { left: 100%; opacity: 0; } 100% { left: 100%; opacity: 0; } }
@keyframes hv2-heat { 0%,100% { opacity: .26; transform: scale(0.96); } 50% { opacity: .46; transform: scale(1.05); } }
@keyframes spin { to { transform: rotate(360deg); } }
.hv2-cta { transition: transform .28s cubic-bezier(.22,.8,.2,1), box-shadow .28s ease; }
.hv2-cta:hover { transform: translateY(-2px); box-shadow: 0 16px 34px -12px rgba(11,16,32,0.42); }
.hv2-arrow { transition: transform .28s cubic-bezier(.22,.8,.2,1); }
.hv2-cta:hover .hv2-arrow { transform: translateX(4px); }
@media (prefers-reduced-motion: reduce) {
  .hv2-anim { animation: none !important; }
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
const VIEWER_GLASS = '0 3px 6px rgba(20,14,50,0.06), 0 18px 40px -12px rgba(44,30,96,0.20), 0 54px 104px -34px rgba(44,30,96,0.38), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 0 0 1px rgba(255,255,255,0.5), inset 0 -26px 48px -28px rgba(120,92,220,0.12)';

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
function Float({ children, dur = 15, delay = 0, style }: {
  children?: React.ReactNode; dur?: number; delay?: number; style?: React.CSSProperties;
}) {
  return (
    <div className="hv2-anim" style={{ animation: `hv2-float ${dur}s ease-in-out ${delay}s infinite`, ...style }}>
      {children}
    </div>
  );
}

export function HeroV2() {
  const reduced = useReducedMotion();

  // Subtle cursor parallax for depth — writes --px/--py (-1..1) on the scene; the
  // viewer follows gently and the background bokeh drifts the opposite way. rAF-
  // throttled, transforms only, skipped under reduced-motion.
  const sceneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sceneRef.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, px = 0, py = 0;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.style.setProperty('--px', px.toFixed(3)); el.style.setProperty('--py', py.toFixed(3)); });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  // Workflow timeline — stable "in progress" state (specimen has reached AI
  // Analysis); the motion is a single soft lavender pulse travelling the connector.
  const activeStep = 2;

  const steps = [
    { label: 'Specimen', sub: 'Collected', Icon: FlaskConical },
    { label: 'Digitized', sub: 'Complete', Icon: Layers },
    { label: 'AI Analysis', sub: 'In Progress', Icon: Brain },
    { label: 'Review', sub: 'Pending', Icon: UserRound },
    { label: 'Report', sub: 'Generating', Icon: FileText },
    { label: 'Delivered', sub: 'Signed', Icon: CheckCircle2 },
  ];

  const detections = [
    { top: '20%', left: '54%', w: '15%', h: '20%', label: 'Carcinoma · 94%', pulse: true, delay: 0.2 },
    { top: '10%', left: '40%', w: '9%', h: '13%', label: 'Mitosis', pulse: false, delay: 0.9 },
    { top: '46%', left: '18%', w: '11%', h: '16%', label: 'Stroma · 88%', pulse: true, delay: 1.5 },
    { top: '58%', left: '68%', w: '12%', h: '15%', label: 'Nucleus · 91%', pulse: false, delay: 2.1 },
  ];

  // Pathology-specific pipeline — these are the exact sub-scores that compose the
  // Nottingham grade shown in the report card below (specimen → diagnosis story).
  const analysisRows = [
    { label: 'Tissue segmentation', done: true },
    { label: 'Nuclei detection', done: true },
    { label: 'Mitotic count', done: true },
    { label: 'Nottingham grading', done: false },
  ];

  const metrics = [
    { Icon: Target, to: 99.1, decimals: 1, suffix: '%', label: 'AI Accuracy', sub: 'On par with pathologists' },
    { Icon: Timer, to: 45, suffix: '%', label: 'Faster Turnaround', sub: 'Average time reduction' },
    { Icon: Layers, to: 10, suffix: 'M+', label: 'Slides Analyzed', sub: 'Across our network' },
    { Icon: Building2, to: 500, suffix: '+', label: 'Labs & Hospitals', sub: 'Trust PathOS' },
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
      position: 'relative', minHeight: 920, overflow: 'hidden',
      fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
      background: '#FAFAFB', display: 'flex', flexDirection: 'column',
    }}>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

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
        {/* large diagonal volumetric light rays — felt, not seen */}
        <div style={{ position: 'absolute', top: '-40%', left: '18%', width: '30%', height: '200%', transform: 'rotate(20deg)', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)', filter: 'blur(90px)' }} />
        <div style={{ position: 'absolute', top: '-40%', left: '52%', width: '26%', height: '200%', transform: 'rotate(20deg)', background: 'linear-gradient(90deg, transparent, rgba(238,234,255,0.4), transparent)', filter: 'blur(110px)' }} />
      </div>

      {/* ── main grid (45 / 55), vertically centered ── */}
      <div style={{
        flex: 1, position: 'relative', zIndex: 1, width: '100%', maxWidth: 1600, margin: '0 auto',
        padding: '110px 72px 40px', display: 'grid', gridTemplateColumns: '45% 55%', gap: 64, alignItems: 'center',
      }}>
        {/* ══════════ LEFT COLUMN ══════════ */}
        <div style={{ maxWidth: 580, transform: 'translateY(-12px)' }}>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: PURPLE,
              background: 'rgba(124,92,255,0.08)', border: '1px solid rgba(124,92,255,0.18)',
              padding: '7px 14px', borderRadius: 999,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: PURPLE }} />
              AI-Powered Pathology
            </span>

            {/* "Three lines exactly" — the binding line is "Cellular intelligence."
                (21 chars); at a 580px column that caps the size ~56px, so the
                literal 72px spec would force a wrap. We honor the 3-line hierarchy
                (and the visual target, which is ~56px) with nowrap per line. */}
            <h1 style={{ margin: '24px 0 0', fontWeight: 700, fontSize: 'clamp(38px, 3.6vw, 56px)', lineHeight: 0.98, letterSpacing: '-0.035em', color: DARK }}>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>Unified pathology.</span>
              <span style={{ display: 'block', whiteSpace: 'nowrap' }}>One platform.</span>
              <span style={{ display: 'block', whiteSpace: 'nowrap', color: PURPLE }}>Cellular intelligence.</span>
            </h1>

            <p style={{ margin: '28px 0 0', maxWidth: 520, fontSize: 22, lineHeight: 1.6, color: '#43485a', fontWeight: 400 }}>
              PathOS unifies every step of the diagnostic journey. From specimen to
              signed report—powered by purpose-built AI.
            </p>

            <div style={{ display: 'flex', gap: 16, marginTop: 40, alignItems: 'center' }}>
              <a href="#" className="hv2-cta" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, height: 56, padding: '0 32px',
                borderRadius: 20, background: DARK, color: '#fff', fontWeight: 600, fontSize: 16, textDecoration: 'none',
              }}>
                Request a demo <ArrowRight size={18} className="hv2-arrow" />
              </a>
              <a href="#" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, height: 56, padding: '0 26px',
                borderRadius: 20, ...glass, color: DARK, fontWeight: 600, fontSize: 16, textDecoration: 'none',
              }}>
                <Play size={16} fill={DARK} /> Explore the platform
              </a>
            </div>

            {/* Credibility metrics — replaces customer logos (we don't have
                permission to imply those relationships). Same heading style +
                horizontal row layout as the old "trusted by" block. */}
            <div style={{ marginTop: 52 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#9aa0ad' }}>
                Built for Modern Pathology
              </div>
              <div style={{ display: 'flex', gap: 34, alignItems: 'flex-start', marginTop: 20, flexWrap: 'wrap' }}>
                {[['99.1%', 'Diagnostic Accuracy'], ['10M+', 'Slides Processed'], ['500+', 'Laboratory Teams'], ['45%', 'Faster Review Time']].map(([v, l]) => (
                  <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 25, fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>{v}</span>
                    <span style={{ fontSize: 12, color: GRAY, lineHeight: 1.25, maxWidth: 92 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ══════════ RIGHT COLUMN — diagnostic-journey scene ══════════ */}
        <div ref={sceneRef} style={{ position: 'relative', minHeight: 640 }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease: [0.22, 0.8, 0.2, 1], delay: 0.15 }}
            style={{ position: 'relative', width: '100%', maxWidth: 760, perspective: 2000 }}
          >
            {/* ── atmospheric depth behind the slide ── soft out-of-focus tissue
                bokeh (real depth layers, NOT stronger gradients). Drifts OPPOSITE
                the cursor for parallax depth; sits behind the glass (negative z). */}
            <div aria-hidden style={{ position: 'absolute', inset: '-10% -8% -14% -8%', zIndex: -1, pointerEvents: 'none',
              transform: 'translate(calc(var(--px,0) * -13px), calc(var(--py,0) * -9px))', transition: 'transform 0.35s ease-out', willChange: 'transform' }}>
              <Float dur={18} style={{ position: 'absolute', top: '4%', left: '0%', width: 190, height: 190, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,92,255,0.22) 0%, transparent 70%)', filter: 'blur(36px)' }} />
              <Float dur={23} delay={1.3} style={{ position: 'absolute', top: '42%', right: '-2%', width: 230, height: 230, borderRadius: '50%', background: 'radial-gradient(circle, rgba(178,120,224,0.18) 0%, transparent 70%)', filter: 'blur(42px)' }} />
              <Float dur={20} delay={0.7} style={{ position: 'absolute', bottom: '0%', left: '22%', width: 210, height: 210, borderRadius: '50%', background: 'radial-gradient(circle, rgba(150,150,255,0.16) 0%, transparent 70%)', filter: 'blur(40px)' }} />
              <Float dur={26} delay={2.0} style={{ position: 'absolute', top: '20%', left: '40%', width: 150, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(206,166,240,0.14) 0%, transparent 70%)', filter: 'blur(34px)' }} />
            </div>

            {/* ── main slide (floating, soft perspective, white glass frame) ──
                wrapped in a parallax layer that follows the cursor (foreground). */}
            <div style={{ transform: 'translate(calc(var(--px,0) * 9px), calc(var(--py,0) * 6px))', transition: 'transform 0.3s ease-out', willChange: 'transform' }}>
            <Float dur={17} style={{ transformStyle: 'preserve-3d' }}>
              <div style={{
                position: 'relative', transform: 'rotateX(3deg) rotateY(-11deg)', transformOrigin: 'center',
                borderRadius: 22, overflow: 'hidden', ...glass, boxShadow: VIEWER_GLASS,
                padding: 10,
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
                  <img src="/cytology-sample.png" alt="Digital pathology slide" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: HE_FILTER }} />
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

                  {/* AI detection boxes — illuminate as the scan line reaches them
                      (delay ∝ vertical position), then fade back to idle */}
                  {detections.map((d, i) => {
                    const delay = (parseFloat(d.top) / 100) * 1.9;
                    return (
                      <div key={i} className="hv2-anim"
                        style={{ position: 'absolute', top: d.top, left: d.left, width: d.w, height: d.h, zIndex: 3, opacity: 1, animation: `hv2-idle 9s ease-in-out ${delay.toFixed(2)}s infinite` }}>
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: 6, border: `1.5px solid ${PURPLE}`,
                          boxShadow: '0 0 0 1px rgba(124,92,255,0.25), 0 0 14px rgba(124,92,255,0.35)',
                          background: 'rgba(124,92,255,0.06)',
                        }} />
                        <span style={{
                          position: 'absolute', top: -20, left: 0, fontSize: 10, fontWeight: 700, color: '#fff',
                          background: PURPLE, padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap',
                          boxShadow: '0 4px 10px rgba(124,92,255,0.4)',
                        }}>{d.label}</span>
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
                  <svg aria-hidden className="hv2-anim" viewBox="0 0 300 200" preserveAspectRatio="none"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 3, pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.85, animation: 'hv2-idle 9s ease-in-out 1.05s infinite' }}>
                    {nuclei.map((n, i) => (
                      <ellipse key={i} cx={n.cx} cy={n.cy} rx={n.rx} ry={n.ry}
                        fill="rgba(150,120,255,0.10)" stroke="rgba(168,140,255,0.95)" strokeWidth="0.7" />
                    ))}
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
                    background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.6)',
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
            <Float dur={14} delay={0.6} style={{ position: 'absolute', top: '4%', right: '-6%', width: 320, zIndex: 10 }}>
              <div style={{ ...glass, borderRadius: 18, padding: 18, boxShadow: SHADOW.analysis }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(124,92,255,0.12)', display: 'grid', placeItems: 'center', color: PURPLE }}>
                    <Brain size={15} />
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: DARK }}>AI Analysis</span>
                </div>
                {analysisRows.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, color: '#3f4557' }}>
                    <span>{r.label}</span>
                    {r.done
                      ? <Check size={15} color={PURPLE} strokeWidth={3} />
                      : <RefreshCw size={13} color={GRAY} className={reduced ? undefined : 'hv2-anim'} style={{ animation: reduced ? undefined : 'spin 2.4s linear infinite' }} />}
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: GRAY }}>Diagnostic Confidence</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: PURPLE, letterSpacing: '-0.02em' }}>92%</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(124,92,255,0.14)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: '92%' }} transition={{ duration: 1.6, ease: [0.22, 0.8, 0.2, 1], delay: 0.8 }}
                    style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, #9d86ff, ${PURPLE})` }}
                  />
                </div>
              </div>
            </Float>

            {/* ── workflow timeline (below the slide) ── the specimen advances
                left → right: steps left of the active one are Complete, the active
                one glows, the rest are pending, and a connector fills to track it. */}
            <Float dur={16} delay={0.3} style={{ position: 'relative', marginTop: 26, zIndex: 8 }}>
              <div style={{ ...glass, borderRadius: 18, padding: '16px 14px', position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, boxShadow: SHADOW.timeline }}>
                {/* progress connector, aligned to the icon-row centre, filling L→R */}
                <div aria-hidden style={{ position: 'absolute', top: 42, left: 'calc(14px + (100% - 28px) / 12)', right: 'calc(14px + (100% - 28px) / 12)', height: 2, background: 'rgba(120,124,140,0.18)', borderRadius: 2, zIndex: 0 }}>
                  <motion.div style={{ height: '100%', borderRadius: 2, background: `linear-gradient(90deg, #9d86ff, ${PURPLE})` }}
                    animate={{ width: `${(activeStep / 5) * 100}%` }} transition={{ duration: 0.8, ease: [0.22, 0.8, 0.2, 1] }} />
                  {/* soft lavender pulse travelling Specimen → Delivered, once per
                      ~9s cycle (brighter, part of the single analysis loop) */}
                  <div className="hv2-anim" aria-hidden style={{ position: 'absolute', top: -5, left: 0, width: 13, height: 13, marginLeft: -6.5, borderRadius: '50%', opacity: 0,
                    background: 'radial-gradient(circle, rgba(178,158,255,1) 0%, rgba(160,138,255,0.5) 42%, transparent 72%)',
                    boxShadow: '0 0 12px rgba(150,120,255,0.85)', animation: 'hv2-travel 9s cubic-bezier(0.4,0,0.2,1) infinite' }} />
                </div>
                {steps.map((s, i) => {
                  const on = i === activeStep;
                  const done = i < activeStep;
                  return (
                    <div key={s.label} style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '8px 2px', textAlign: 'center' }}>
                      <span style={{
                        width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center',
                        color: on ? '#fff' : done ? PURPLE : GRAY,
                        background: on ? PURPLE : done ? 'rgba(124,92,255,0.14)' : 'rgba(120,124,140,0.08)',
                        boxShadow: on ? '0 8px 20px -6px rgba(124,92,255,0.6)' : 'none', transition: 'all 0.5s ease',
                      }}>
                        <s.Icon size={17} />
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: on || done ? DARK : '#6b7280', lineHeight: 1.1 }}>{s.label}</span>
                      <span style={{ fontSize: 9.5, color: on ? PURPLE : done ? '#8b8f9c' : '#a2a7b3', fontWeight: 600 }}>{done ? 'Complete' : s.sub}</span>
                    </div>
                  );
                })}
              </div>
            </Float>

            {/* ── report card ── raised to overlap the workflow panel slightly, so it
                reads as the OUTPUT of the workflow (highest depth plane) ── */}
            <Float dur={15} delay={1.1} style={{ position: 'absolute', bottom: '-23%', right: '-3%', width: 360, zIndex: 12 }}>
              <div style={{ ...glass, borderRadius: 18, padding: 18, boxShadow: SHADOW.report }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GRAY, letterSpacing: '0.02em' }}>Report Preview</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: PURPLE, background: 'rgba(124,92,255,0.1)', padding: '2px 8px', borderRadius: 6 }}>Draft</span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>Invasive Ductal Carcinoma</div>
                <div style={{ fontSize: 12.5, color: GRAY, marginTop: 2 }}>Nottingham Grade 2</div>
                <div style={{ display: 'flex', gap: 7, marginTop: 12 }}>
                  {['ER Positive', 'PR Positive', 'HER2 Negative'].map((t) => (
                    <span key={t} style={{ fontSize: 11, fontWeight: 600, color: '#43485a', background: 'rgba(120,124,140,0.10)', padding: '4px 9px', borderRadius: 7 }}>{t}</span>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(11,16,32,0.07)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: GRAY }}>
                    <ShieldCheck size={14} color={PURPLE} /> Board Certified
                  </div>
                  <span style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic', fontSize: 22, color: DARK, opacity: 0.85 }}>J. Reyes</span>
                </div>
              </div>
            </Float>
          </motion.div>
        </div>
      </div>
      {/* (Bottom metrics band removed — the four credibility metrics now live in the
          left column in place of the customer logos, so they aren't shown twice.) */}
    </section>
  );
}

function MetricsRow({ metrics }: { metrics: { Icon: typeof Target; to: number; decimals?: number; suffix?: string; label: string; sub: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10%' });
  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 1600, margin: '0 auto', padding: '28px 72px 48px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 40, borderTop: '1px solid rgba(11,16,32,0.06)', paddingTop: 30 }}>
        {metrics.map((m, i) => (
          <motion.div key={m.label}
            initial={{ opacity: 0, y: 18 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 0.8, 0.2, 1] }}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', color: PURPLE, background: 'rgba(124,92,255,0.09)', marginBottom: 8 }}>
              <m.Icon size={17} />
            </span>
            <span style={{ fontSize: 32, fontWeight: 800, color: DARK, letterSpacing: '-0.03em' }}>
              <CountUp to={m.to} decimals={m.decimals} suffix={m.suffix} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: DARK }}>{m.label}</span>
            <span style={{ fontSize: 12.5, color: GRAY }}>{m.sub}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default HeroV2;
