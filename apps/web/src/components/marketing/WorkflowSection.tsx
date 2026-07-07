'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useAnimationFrame } from 'framer-motion';
import { TestTube2, ScanLine, BrainCircuit, ClipboardCheck, FileCheck2, ArrowRight, Play } from 'lucide-react';

const RED = '#E63946';
const EASE = [0.22, 0.8, 0.2, 1] as const;

type Stage = {
  key: string; title: string; lead: string; Icon: typeof TestTube2; active?: boolean;
  time: string; ai: string; bullets: string[];
};

const STAGES: Stage[] = [
  { key: 'collect', title: 'Collect', lead: 'Specimen intake', Icon: TestTube2,
    time: '~2 min', ai: 'Barcode assist',
    bullets: ['Specimen accessioning', 'Barcode validation', 'Chain of custody'] },
  { key: 'process', title: 'Process', lead: 'Preparation & imaging', Icon: ScanLine,
    time: '~8 min', ai: 'Assisted',
    bullets: ['Automated preparation', 'Digital imaging', 'Quality verification'] },
  { key: 'ai', title: 'AI Analysis', lead: 'Screening intelligence', Icon: BrainCircuit, active: true,
    time: '14 sec', ai: 'Full screening',
    bullets: ['Deep learning inference', 'Region detection', 'Confidence scoring'] },
  { key: 'review', title: 'Review', lead: 'Pathologist verification', Icon: ClipboardCheck,
    time: '~5 min', ai: 'Human-in-loop',
    bullets: ['Pathologist verification', 'Annotation tools', 'Diagnostic approval'] },
  { key: 'report', title: 'Report', lead: 'Structured delivery', Icon: FileCheck2,
    time: 'instant', ai: 'Formatting',
    bullets: ['CAP-compliant reporting', 'LIS delivery', 'FHIR integration'] },
];

// Deterministic ambient field (no Math.random → SSR-safe). Out-of-focus "cells"
// (bokeh) drift behind the workflow; tiny AI particles sparkle between them.
const CELLS = [
  { x: 60, y: 18, s: 190, tint: 'rose', o: 0.16, d: 0 },
  { x: 82, y: 52, s: 250, tint: 'violet', o: 0.14, d: 1.2 },
  { x: 48, y: 70, s: 150, tint: 'rose', o: 0.12, d: 2.1 },
  { x: 92, y: 24, s: 130, tint: 'violet', o: 0.13, d: 0.6 },
  { x: 70, y: 84, s: 200, tint: 'violet', o: 0.10, d: 1.6 },
  { x: 40, y: 30, s: 110, tint: 'rose', o: 0.10, d: 2.6 },
  { x: 96, y: 66, s: 160, tint: 'rose', o: 0.11, d: 0.9 },
  { x: 55, y: 46, s: 90, tint: 'violet', o: 0.12, d: 3.0 },
];
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  x: 38 + ((i * 41) % 60), y: 12 + ((i * 27) % 80),
  s: i % 4 === 0 ? 3 : 2, d: (i % 7) * 0.5, dur: 5 + (i % 5),
  tint: i % 3 === 0 ? RED : 'rgba(196,181,253,0.9)',
}));

// Line data stream — faint travellers + occasional bright pulses.
const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  dur: 4600 + (i % 6) * 800, off: i / 18, size: i % 5 === 0 ? 4 : 2, bright: i % 5 === 0,
}));

export function WorkflowSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.3 });
  const [hovered, setHovered] = useState<number | null>(null);

  const railRef = useRef<HTMLDivElement>(null);
  const [railW, setRailW] = useState(0);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRailW(el.clientWidth));
    ro.observe(el);
    setRailW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const partRefs = useRef<(HTMLDivElement | null)[]>([]);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const [aiPing, setAiPing] = useState(0);
  const lastZone = useRef(false);

  useAnimationFrame((t) => {
    const W = railW;
    if (!W) return;
    for (let i = 0; i < PARTICLES.length; i++) {
      const el = partRefs.current[i];
      if (!el) continue;
      const p = PARTICLES[i];
      const prog = (t / p.dur + p.off) % 1;
      el.style.transform = `translate3d(${prog * W}px, -50%, 0)`;
      el.style.opacity = String((p.bright ? 0.45 : 0.18) + (p.bright ? 0.55 : 0.42) * Math.sin(prog * Math.PI));
    }
    const cap = capsuleRef.current;
    if (cap) {
      const prog = (t / 7000) % 1;
      cap.style.transform = `translate3d(${prog * W}px, -50%, 0)`;
      // Emit a ripple as the specimen reaches the AI node (rail centre).
      const inZone = prog > 0.47 && prog < 0.53;
      if (inZone && !lastZone.current) setAiPing((n) => n + 1);
      lastZone.current = inZone;
    }
  });

  return (
    <section ref={sectionRef} id="solutions" className="wf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Ambient stage */}
      <div className="wf-bloom wf-bloom-a" />
      <div className="wf-bloom wf-bloom-b" />
      <div className="wf-ray wf-ray-1" />
      <div className="wf-ray wf-ray-2" />

      {/* Biological environment — bokeh cells + drifting AI particles */}
      <div className="wf-bio" aria-hidden>
        {CELLS.map((c, i) => (
          <motion.span
            key={i}
            className={`wf-cell ${c.tint}`}
            style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.s, height: c.s }}
            animate={{ x: [0, 18, -10, 0], y: [0, -16, 10, 0], opacity: [c.o, c.o * 1.5, c.o] }}
            transition={{ duration: 16 + c.d * 2, repeat: Infinity, ease: 'easeInOut', delay: c.d }}
          />
        ))}
        {SPARKS.map((s, i) => (
          <motion.span
            key={i}
            className="wf-spark"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, background: s.tint }}
            animate={{ y: [0, -24, 0], opacity: [0, 0.9, 0], scale: [0.6, 1, 0.6] }}
            transition={{ duration: s.dur, repeat: Infinity, ease: 'easeInOut', delay: s.d }}
          />
        ))}
      </div>

      <div className="wf-noise" />
      <div className="wf-vignette" />

      <div className="wf-inner">
        {/* LEFT — editorial */}
        <motion.div
          className="wf-left"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <div className="wf-eyebrow">One system. End to end.</div>
          <h2 className="wf-title">
            Built for the way<br />pathology labs <em>work.</em>
          </h2>
          <p className="wf-lede">
            From specimen collection to AI-powered diagnosis and structured reporting,
            CYTOLAB connects every step into one intelligent workflow.
          </p>
          <div className="wf-actions">
            <a href="#demo" className="wf-cta">
              <span>Explore Workflow</span>
              <span className="wf-cta-arrow"><ArrowRight size={18} /></span>
            </a>
            <a href="#demo" className="wf-link"><Play size={15} /> Watch Platform Demo</a>
          </div>
        </motion.div>

        {/* RIGHT — animated workflow */}
        <div className="wf-right">
          <div className="wf-rail-wrap">
            <div ref={railRef} className="wf-rail">
              <div className="wf-rail-base" />
              <motion.div
                className="wf-rail-fill"
                initial={{ scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : {}}
                transition={{ duration: 1.7, ease: EASE, delay: 0.15 }}
              />
              {PARTICLES.map((p, i) => (
                <div key={i} ref={(el) => { partRefs.current[i] = el; }}
                  className={`wf-particle ${p.bright ? 'is-bright' : ''}`} style={{ width: p.size, height: p.size }} />
              ))}
              <div ref={capsuleRef} className="wf-capsule"><span /></div>
            </div>

            <div className="wf-nodes">
              {STAGES.map((s, i) => (
                <motion.div
                  key={s.key}
                  className={`wf-node ${s.active ? 'is-ai' : ''}`}
                  initial={{ opacity: 0, y: 18 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.55, ease: EASE, delay: 0.25 + i * 0.28 }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <motion.div
                    className={`wf-circle ${s.active ? 'is-active' : ''} ${hovered === i ? 'is-hover' : ''}`}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {s.active && (
                      <>
                        <span className="wf-bloom-node" />
                        <motion.span className="wf-ring"
                          animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: 'linear' }} />
                        <motion.span className="wf-ring wf-ring-2"
                          animate={{ rotate: -360 }} transition={{ duration: 14, repeat: Infinity, ease: 'linear' }} />
                        <motion.span className="wf-halo"
                          animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
                        <motion.span className="wf-ripple"
                          animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }} />
                        {/* Extra ripple pinged by the travelling specimen */}
                        <AnimatePresence>
                          <motion.span key={aiPing} className="wf-ripple wf-ripple-ping"
                            initial={{ scale: 1, opacity: 0.6 }} animate={{ scale: 2.3, opacity: 0 }}
                            transition={{ duration: 1.1, ease: 'easeOut' }} />
                        </AnimatePresence>
                        {/* Orbiting particles */}
                        <motion.span className="wf-orbit"
                          animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}>
                          <i /><i /><i />
                        </motion.span>
                      </>
                    )}
                    <span className="wf-glass" />
                    <motion.span className="wf-icon"
                      animate={hovered === i ? { scale: 1.14, rotate: [0, -4, 4, 0] } : { scale: 1, rotate: 0 }}
                      transition={{ duration: 0.5, ease: 'easeInOut' }}>
                      <s.Icon size={s.active ? 34 : 28} strokeWidth={1.6} />
                    </motion.span>
                  </motion.div>

                  <div className={`wf-node-title ${s.active ? 'is-active' : ''}`}>{s.title}</div>
                  <div className="wf-node-lead">{s.lead}</div>
                  <ul className="wf-node-bullets">
                    {s.bullets.map((bt) => <li key={bt}>{bt}</li>)}
                  </ul>

                  <AnimatePresence>
                    {hovered === i && (
                      <motion.div className="wf-card"
                        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.28, ease: EASE }}>
                        <div className="wf-card-head">
                          <span className={`wf-card-dot ${s.active ? 'is-active' : ''}`} />
                          <span className="wf-card-title">{s.title}</span>
                        </div>
                        <div className="wf-card-meta">
                          <div><span>Processing</span><b>{s.time}</b></div>
                          <div><span>AI role</span><b>{s.ai}</b></div>
                        </div>
                        <ul className="wf-card-metrics">
                          {s.bullets.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CSS = `
  .wf {
    --red: #E63946;
    --purple: 139,92,246;
    --ink: #0E1016;
    position: relative; width: 100%; min-height: 960px;
    padding: 150px 56px 120px; overflow: hidden; isolation: isolate;
    background:
      radial-gradient(1100px 640px at 74% 44%, rgba(139,92,246,.12), transparent 62%),
      radial-gradient(760px 520px at 62% 46%, rgba(230,57,70,.10), transparent 60%),
      linear-gradient(180deg, #ffffff 0%, #f2f1f6 9%, #14151d 32%, var(--ink) 100%);
    font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #fff;
  }

  .wf-bloom { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; }
  .wf-bloom-a { width: 680px; height: 680px; right: 6%; top: 24%; background: radial-gradient(circle, rgba(230,57,70,.18), transparent 70%); }
  .wf-bloom-b { width: 560px; height: 560px; left: 26%; bottom: -12%; background: radial-gradient(circle, rgba(139,92,246,.16), transparent 70%); }
  .wf-ray { position: absolute; z-index: 0; pointer-events: none; filter: blur(6px); mix-blend-mode: screen; opacity: .5; }
  .wf-ray-1 { top: -10%; left: 46%; width: 340px; height: 130%; transform: rotate(16deg);
    background: linear-gradient(180deg, rgba(196,181,253,.10), transparent 70%); }
  .wf-ray-2 { top: -10%; left: 70%; width: 260px; height: 130%; transform: rotate(-12deg);
    background: linear-gradient(180deg, rgba(230,57,70,.08), transparent 65%); }

  /* Biological ambient */
  .wf-bio { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .wf-cell { position: absolute; border-radius: 50%; transform: translate(-50%,-50%); filter: blur(3px); will-change: transform, opacity; }
  .wf-cell.rose { background: radial-gradient(circle at 40% 38%, rgba(255,120,140,.5), rgba(230,57,70,.18) 45%, transparent 66%);
    box-shadow: inset 0 0 40px rgba(230,57,70,.25); }
  .wf-cell.violet { background: radial-gradient(circle at 40% 38%, rgba(196,181,253,.5), rgba(139,92,246,.16) 45%, transparent 66%);
    box-shadow: inset 0 0 40px rgba(139,92,246,.25); }
  .wf-spark { position: absolute; border-radius: 50%; will-change: transform, opacity; box-shadow: 0 0 6px currentColor; }

  .wf-noise { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: .045; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .wf-vignette { position: absolute; inset: 0; z-index: 2; pointer-events: none; background: radial-gradient(120% 100% at 50% 32%, transparent 52%, rgba(0,0,0,.4)); }

  .wf-inner { position: relative; z-index: 3; max-width: 1680px; margin: 0 auto;
    display: grid; grid-template-columns: 34% 66%; gap: 40px; align-items: center; }

  /* LEFT */
  .wf-left { max-width: 480px; }
  .wf-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); margin-bottom: 26px; }
  .wf-title { font-size: 80px; line-height: 1.02; font-weight: 800; letter-spacing: -.03em; margin: 0; }
  .wf-title em { font-style: italic; color: var(--red); }
  .wf-lede { margin: 28px 0 0; font-size: 17px; line-height: 1.7; color: rgba(255,255,255,.6); max-width: 420px; }
  .wf-actions { margin-top: 40px; display: flex; align-items: center; gap: 24px; }
  .wf-cta {
    position: relative; display: inline-flex; align-items: center; gap: 10px; height: 54px; padding: 0 30px;
    border-radius: 999px; color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; overflow: hidden;
    background: linear-gradient(135deg, #F0555F 0%, #E63946 55%, #C42B38 100%);
    box-shadow: 0 18px 50px rgba(230,57,70,.34), inset 0 1px 0 rgba(255,255,255,.28), inset 0 -8px 20px rgba(0,0,0,.18);
    transition: transform .35s cubic-bezier(.22,.8,.2,1), box-shadow .35s cubic-bezier(.22,.8,.2,1);
  }
  .wf-cta::before { content: ''; position: absolute; inset: 0; border-radius: inherit;
    background: radial-gradient(120% 80% at 30% 0%, rgba(255,255,255,.35), transparent 60%); opacity: .6; }
  .wf-cta span { position: relative; z-index: 1; display: inline-flex; }
  .wf-cta-arrow { transition: transform .35s cubic-bezier(.22,.8,.2,1); }
  .wf-cta:hover { transform: translateY(-2px); box-shadow: 0 26px 70px rgba(230,57,70,.46), inset 0 1px 0 rgba(255,255,255,.3); }
  .wf-cta:hover .wf-cta-arrow { transform: translateX(5px); }
  .wf-link { display: inline-flex; align-items: center; gap: 7px; color: rgba(255,255,255,.7); font-size: 14px; font-weight: 600; text-decoration: none; transition: color .3s; }
  .wf-link:hover { color: #fff; }

  /* RIGHT */
  .wf-right { position: relative; }
  .wf-rail-wrap { position: relative; padding: 40px 0; }
  .wf-rail { position: absolute; top: 90px; left: 9%; right: 9%; height: 2px; z-index: 0; }
  .wf-rail-base { position: absolute; inset: 0; border-radius: 2px; background: linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.18), rgba(255,255,255,.05)); }
  .wf-rail-fill { position: absolute; inset: 0; transform-origin: left center; border-radius: 2px;
    background: linear-gradient(90deg, rgba(230,57,70,0), rgba(230,57,70,.75) 45%, rgba(139,92,246,.75) 78%, rgba(139,92,246,0));
    box-shadow: 0 0 14px rgba(230,57,70,.45); }
  .wf-particle { position: absolute; top: 50%; left: 0; border-radius: 50%; background: #FB7185; box-shadow: 0 0 6px rgba(251,113,133,.9); will-change: transform, opacity; }
  .wf-particle.is-bright { background: var(--red); box-shadow: 0 0 12px rgba(230,57,70,.95); }
  .wf-capsule { position: absolute; top: 50%; left: 0; width: 0; height: 0; z-index: 3; will-change: transform; }
  .wf-capsule span { position: absolute; left: -8px; top: -8px; width: 16px; height: 16px; border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #fff, var(--red) 58%, rgba(230,57,70,.15));
    box-shadow: 0 0 20px rgba(230,57,70,.95), 0 0 42px rgba(230,57,70,.5); }

  .wf-nodes { position: relative; z-index: 1; display: flex; align-items: flex-start; }
  .wf-node { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }

  .wf-circle { position: relative; width: 100px; height: 100px; border-radius: 50%; display: grid; place-items: center; will-change: transform;
    box-shadow: 0 12px 44px rgba(0,0,0,.45), inset 0 1px 1px rgba(255,255,255,.18);
    transition: box-shadow .4s cubic-bezier(.22,.8,.2,1), transform .35s cubic-bezier(.22,.8,.2,1); }
  .wf-node.is-ai .wf-circle { width: 132px; height: 132px; }
  .wf-glass { position: absolute; inset: 0; border-radius: 50%;
    background: linear-gradient(160deg, rgba(var(--purple),.20), rgba(var(--purple),.05));
    border: 1px solid rgba(var(--purple),.30); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
  .wf-glass::after { content: ''; position: absolute; left: 14%; top: 8%; width: 46%; height: 34%; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.35), transparent 70%); }
  .wf-icon { position: relative; z-index: 3; color: #fff; display: grid; place-items: center; will-change: transform; }
  .wf-circle.is-hover { transform: scale(1.08) translateY(-6px); box-shadow: 0 24px 64px rgba(139,92,246,.4), inset 0 1px 1px rgba(255,255,255,.22); }

  /* Active AI node — the hero */
  .wf-node.is-ai { margin-top: -16px; }
  .wf-circle.is-active .wf-glass { border-color: rgba(230,57,70,.6); background: linear-gradient(160deg, rgba(230,57,70,.26), rgba(230,57,70,.06)); }
  .wf-circle.is-active { box-shadow: 0 0 60px rgba(230,57,70,.6), 0 16px 54px rgba(230,57,70,.4), inset 0 1px 1px rgba(255,255,255,.24); }
  .wf-bloom-node { position: absolute; left: 50%; top: 50%; width: 260px; height: 260px; transform: translate(-50%,-50%);
    border-radius: 50%; background: radial-gradient(circle, rgba(230,57,70,.35), transparent 62%); filter: blur(14px); z-index: 0; pointer-events: none; }
  .wf-ring { position: absolute; inset: -8px; border-radius: 50%; z-index: 1;
    background: conic-gradient(from 0deg, transparent, rgba(230,57,70,.95), transparent 52%, rgba(139,92,246,.75), transparent);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  .wf-ring-2 { inset: -16px; opacity: .5;
    background: conic-gradient(from 90deg, transparent, rgba(139,92,246,.8), transparent 60%, rgba(230,57,70,.6), transparent); }
  .wf-halo { position: absolute; inset: -4px; border-radius: 50%; z-index: 0; box-shadow: 0 0 40px rgba(230,57,70,.55); }
  .wf-ripple { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(230,57,70,.6); z-index: 1; }
  .wf-ripple-ping { border-color: rgba(255,180,190,.8); }
  .wf-orbit { position: absolute; inset: -14px; z-index: 2; }
  .wf-orbit i { position: absolute; width: 6px; height: 6px; border-radius: 50%; background: #FB7185; box-shadow: 0 0 8px rgba(251,113,133,1); }
  .wf-orbit i:nth-child(1) { top: -3px; left: 50%; }
  .wf-orbit i:nth-child(2) { bottom: 8%; right: -3px; background: #C4B5FD; box-shadow: 0 0 8px rgba(196,181,253,1); }
  .wf-orbit i:nth-child(3) { bottom: 8%; left: -3px; background: var(--red); box-shadow: 0 0 8px rgba(230,57,70,1); }

  .wf-node-title { margin-top: 22px; font-size: 16px; font-weight: 700; color: #fff; }
  .wf-node.is-ai .wf-node-title { margin-top: 26px; font-size: 17px; }
  .wf-node-title.is-active { color: var(--red); }
  .wf-node-lead { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,.5); font-weight: 600; }
  .wf-node-bullets { margin: 12px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; align-items: center; }
  .wf-node-bullets li { position: relative; font-size: 11.5px; color: rgba(255,255,255,.42); padding-left: 14px; }
  .wf-node-bullets li::before { content: ''; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; border-radius: 50%; background: rgba(255,255,255,.28); }
  .wf-node.is-ai .wf-node-bullets li::before { background: rgba(230,57,70,.8); box-shadow: 0 0 6px rgba(230,57,70,.6); }

  /* Hover card */
  .wf-card { position: absolute; top: 210px; left: 50%; transform: translateX(-50%); width: 264px; z-index: 20;
    padding: 16px; border-radius: 16px; text-align: left;
    background: rgba(22,24,34,.74); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
    border: 1px solid rgba(255,255,255,.10); box-shadow: 0 30px 70px rgba(0,0,0,.5); }
  .wf-node.is-ai .wf-card { top: 226px; }
  .wf-card::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%) rotate(45deg);
    width: 12px; height: 12px; background: rgba(22,24,34,.74); border-left: 1px solid rgba(255,255,255,.10); border-top: 1px solid rgba(255,255,255,.10); }
  .wf-card-head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .wf-card-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(139,92,246,.9); }
  .wf-card-dot.is-active { background: var(--red); box-shadow: 0 0 10px rgba(230,57,70,.9); }
  .wf-card-title { font-size: 15px; font-weight: 700; color: #fff; }
  .wf-card-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .wf-card-meta div { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.07); border-radius: 10px; padding: 8px 10px; }
  .wf-card-meta span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: rgba(255,255,255,.4); }
  .wf-card-meta b { font-size: 13px; color: #fff; font-weight: 700; }
  .wf-card-metrics { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .wf-card-metrics li { position: relative; padding-left: 18px; font-size: 12px; color: rgba(255,255,255,.72); }
  .wf-card-metrics li::before { content: ''; position: absolute; left: 0; top: 5px; width: 8px; height: 8px; border-radius: 50%; background: rgba(52,211,153,.9); box-shadow: 0 0 8px rgba(52,211,153,.7); }

  @media (max-width: 1100px) {
    .wf { padding: 100px 28px 90px; }
    .wf-inner { grid-template-columns: 1fr; gap: 56px; }
    .wf-title { font-size: 52px; }
    .wf-rail { top: 79px; left: 7%; right: 7%; }
    .wf-circle { width: 78px; height: 78px; }
    .wf-node.is-ai { margin-top: -10px; }
    .wf-node.is-ai .wf-circle { width: 98px; height: 98px; }
    .wf-node-bullets, .wf-card { display: none; }
  }
`;
