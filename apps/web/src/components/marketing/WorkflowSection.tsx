'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView, useAnimationFrame } from 'framer-motion';
import { FlaskConical, Layers, BrainCircuit, UserCheck, FileText, ArrowRight, Play } from 'lucide-react';

const RED = '#E63946';

type Stage = {
  key: string; title: string; desc: string;
  Icon: typeof FlaskConical; active?: boolean;
  time: string; ai: string; metrics: string[];
};

const STAGES: Stage[] = [
  { key: 'collect', title: 'Collect', desc: 'Seamless specimen intake and tracking', Icon: FlaskConical,
    time: '~2 min', ai: 'Barcode assist', metrics: ['Chain-of-custody tracked', 'Zero mislabels', 'Instant accessioning'] },
  { key: 'process', title: 'Process', desc: 'Automated preparation and digital imaging', Icon: Layers,
    time: '~8 min', ai: 'Assisted', metrics: ['Automated staining', '40× whole-slide scan', 'Real-time slide QC'] },
  { key: 'ai', title: 'AI Analysis', desc: 'AI-powered screening with clinical accuracy', Icon: BrainCircuit, active: true,
    time: '14 sec', ai: 'Full screening', metrics: ['98.4% confidence', '12.8M cells analyzed', 'High-risk regions flagged'] },
  { key: 'review', title: 'Pathologist Review', desc: 'Expert review and quality control', Icon: UserCheck,
    time: '~5 min', ai: 'Human-in-loop', metrics: ['Board-certified sign-out', 'AI second read', 'Audit trail'] },
  { key: 'report', title: 'Report Delivery', desc: 'Structured reporting and delivery', Icon: FileText,
    time: 'instant', ai: 'Formatting', metrics: ['FHIR / HL7 export', 'Portal + PDF', 'Auto-notify clinician'] },
];

// Particle stream config — a mix of faint travelers and occasional bright pulses.
const PARTICLES = Array.from({ length: 16 }, (_, i) => ({
  dur: 5200 + (i % 5) * 900,
  off: (i / 16),
  size: i % 6 === 0 ? 4 : 2,
  bright: i % 6 === 0,
}));

export function WorkflowSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.3 });
  const [hovered, setHovered] = useState<number | null>(null);

  // Rail pixel width drives the rAF-positioned particles + capsule.
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

  useAnimationFrame((t) => {
    const W = railW;
    if (!W) return;
    for (let i = 0; i < PARTICLES.length; i++) {
      const el = partRefs.current[i];
      if (!el) continue;
      const p = PARTICLES[i];
      const prog = (t / p.dur + p.off) % 1;
      el.style.transform = `translate3d(${prog * W}px, -50%, 0)`;
      el.style.opacity = String((p.bright ? 0.4 : 0.15) + (p.bright ? 0.6 : 0.45) * Math.sin(prog * Math.PI));
    }
    const cap = capsuleRef.current;
    if (cap) {
      const prog = (t / 7000) % 1;
      cap.style.transform = `translate3d(${prog * W}px, -50%, 0)`;
    }
  });

  return (
    <section ref={sectionRef} id="solutions" className="wf">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Ambient layers */}
      <div className="wf-bloom wf-bloom-a" />
      <div className="wf-bloom wf-bloom-b" />
      <div className="wf-noise" />
      <div className="wf-vignette" />

      <div className="wf-inner">
        {/* LEFT — editorial */}
        <motion.div
          className="wf-left"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 0.8, 0.2, 1] }}
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
            <a href="#demo" className="wf-cta">Explore Workflow <ArrowRight size={18} /></a>
            <a href="#demo" className="wf-link"><Play size={15} /> Watch Platform Demo</a>
          </div>
        </motion.div>

        {/* RIGHT — animated workflow */}
        <div className="wf-right">
          <div className="wf-rail-wrap">
            {/* Connecting line + data stream */}
            <div ref={railRef} className="wf-rail">
              <div className="wf-rail-base" />
              <motion.div
                className="wf-rail-fill"
                initial={{ scaleX: 0 }}
                animate={inView ? { scaleX: 1 } : {}}
                transition={{ duration: 1.7, ease: [0.22, 0.8, 0.2, 1], delay: 0.15 }}
              />
              {PARTICLES.map((p, i) => (
                <div
                  key={i}
                  ref={(el) => { partRefs.current[i] = el; }}
                  className={`wf-particle ${p.bright ? 'is-bright' : ''}`}
                  style={{ width: p.size, height: p.size }}
                />
              ))}
              {/* Live specimen capsule travelling the full path */}
              <div ref={capsuleRef} className="wf-capsule"><span /></div>
            </div>

            {/* Nodes */}
            <div className="wf-nodes">
              {STAGES.map((s, i) => (
                <motion.div
                  key={s.key}
                  className="wf-node"
                  initial={{ opacity: 0, y: 18 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.55, ease: [0.22, 0.8, 0.2, 1], delay: 0.25 + i * 0.28 }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <motion.div
                    className={`wf-circle ${s.active ? 'is-active' : ''} ${hovered === i ? 'is-hover' : ''}`}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {/* Active node dressing */}
                    {s.active && (
                      <>
                        <motion.span className="wf-ring"
                          animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
                        <motion.span className="wf-ripple"
                          animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
                        <motion.span className="wf-pulse"
                          animate={{ scale: [1, 1.06, 1], opacity: [0.9, 1, 0.9] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
                      </>
                    )}
                    <span className="wf-glass" />
                    <motion.span
                      className="wf-icon"
                      animate={hovered === i ? { scale: 1.12, rotate: [0, -4, 4, 0] } : { scale: 1, rotate: 0 }}
                      transition={{ duration: 0.5, ease: 'easeInOut' }}
                    >
                      <s.Icon size={30} strokeWidth={1.6} />
                    </motion.span>
                  </motion.div>

                  <div className={`wf-node-title ${s.active ? 'is-active' : ''}`}>{s.title}</div>
                  <div className="wf-node-desc">{s.desc}</div>

                  {/* Hover info card */}
                  <AnimatePresence>
                    {hovered === i && (
                      <motion.div
                        className="wf-card"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.28, ease: [0.22, 0.8, 0.2, 1] }}
                      >
                        <div className="wf-card-head">
                          <span className={`wf-card-dot ${s.active ? 'is-active' : ''}`} />
                          <span className="wf-card-title">{s.title}</span>
                        </div>
                        <p className="wf-card-desc">{s.desc}</p>
                        <div className="wf-card-meta">
                          <div><span>Processing</span><b>{s.time}</b></div>
                          <div><span>AI role</span><b>{s.ai}</b></div>
                        </div>
                        <ul className="wf-card-metrics">
                          {s.metrics.map((m) => <li key={m}>{m}</li>)}
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
    position: relative;
    width: 100%;
    min-height: 900px;
    padding: 140px 56px 120px;
    overflow: hidden;
    background:
      radial-gradient(1200px 700px at 78% 30%, rgba(139,92,246,.10), transparent 60%),
      linear-gradient(180deg, #ffffff 0%, #f3f2f7 10%, #14151d 34%, var(--ink) 100%);
    font-family: Geist, ui-sans-serif, system-ui, sans-serif;
    color: #fff;
    isolation: isolate;
  }

  /* Ambient bloom + texture */
  .wf-bloom { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; z-index: 0; }
  .wf-bloom-a { width: 620px; height: 620px; right: 8%; top: 22%; background: radial-gradient(circle, rgba(230,57,70,.16), transparent 70%); }
  .wf-bloom-b { width: 520px; height: 520px; left: 30%; bottom: -10%; background: radial-gradient(circle, rgba(139,92,246,.14), transparent 70%); }
  .wf-noise {
    position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: .04; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .wf-vignette { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(120% 100% at 50% 30%, transparent 55%, rgba(0,0,0,.35)); }

  .wf-inner {
    position: relative; z-index: 2;
    max-width: 1680px; margin: 0 auto;
    display: grid; grid-template-columns: 35% 65%; gap: 48px; align-items: center;
  }

  /* LEFT */
  .wf-left { max-width: 480px; }
  .wf-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: rgba(255,255,255,.55); margin-bottom: 26px; }
  .wf-title { font-size: 80px; line-height: 1.02; font-weight: 800; letter-spacing: -.03em; margin: 0; color: #fff; }
  .wf-title em { font-style: italic; color: var(--red); font-weight: 800; }
  .wf-lede { margin: 28px 0 0; font-size: 17px; line-height: 1.7; color: rgba(255,255,255,.6); max-width: 420px; }
  .wf-actions { margin-top: 40px; display: flex; align-items: center; gap: 24px; }
  .wf-cta {
    display: inline-flex; align-items: center; gap: 8px; height: 52px; padding: 0 28px;
    border-radius: 999px; background: var(--red); color: #fff; font-size: 15px; font-weight: 600; text-decoration: none;
    box-shadow: 0 18px 50px rgba(230,57,70,.32);
    transition: transform .35s cubic-bezier(.22,.8,.2,1), box-shadow .35s cubic-bezier(.22,.8,.2,1);
  }
  .wf-cta:hover { transform: translateY(-2px); box-shadow: 0 24px 66px rgba(230,57,70,.42); }
  .wf-link { display: inline-flex; align-items: center; gap: 7px; color: rgba(255,255,255,.7); font-size: 14px; font-weight: 600; text-decoration: none; transition: color .3s; }
  .wf-link:hover { color: #fff; }

  /* RIGHT */
  .wf-right { position: relative; }
  .wf-rail-wrap { position: relative; padding: 40px 0; }

  .wf-rail { position: absolute; top: 40px; left: 10%; right: 10%; height: 2px; z-index: 0; }
  .wf-rail-base { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,255,255,.06), rgba(255,255,255,.16), rgba(255,255,255,.06)); border-radius: 2px; }
  .wf-rail-fill { position: absolute; inset: 0; transform-origin: left center; border-radius: 2px;
    background: linear-gradient(90deg, rgba(230,57,70,.0), rgba(230,57,70,.7) 45%, rgba(139,92,246,.7) 75%, rgba(139,92,246,0));
    box-shadow: 0 0 12px rgba(230,57,70,.4); }

  .wf-particle { position: absolute; top: 50%; left: 0; border-radius: 50%; background: #FB7185; will-change: transform, opacity; box-shadow: 0 0 6px rgba(251,113,133,.9); }
  .wf-particle.is-bright { background: var(--red); box-shadow: 0 0 12px rgba(230,57,70,.9); }

  .wf-capsule { position: absolute; top: 50%; left: 0; width: 0; height: 0; z-index: 3; will-change: transform; }
  .wf-capsule span {
    position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%;
    background: radial-gradient(circle at 40% 35%, #fff, var(--red) 60%, rgba(230,57,70,.2));
    box-shadow: 0 0 18px rgba(230,57,70,.9), 0 0 36px rgba(230,57,70,.5);
  }

  .wf-nodes { position: relative; z-index: 1; display: flex; }
  .wf-node { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; position: relative; }

  .wf-circle {
    position: relative; width: 100px; height: 100px; border-radius: 50%;
    display: grid; place-items: center; will-change: transform;
    transition: box-shadow .4s cubic-bezier(.22,.8,.2,1), transform .35s cubic-bezier(.22,.8,.2,1);
    box-shadow: 0 10px 40px rgba(0,0,0,.4), inset 0 1px 1px rgba(255,255,255,.18);
  }
  .wf-glass {
    position: absolute; inset: 0; border-radius: 50%;
    background: linear-gradient(160deg, rgba(var(--purple),.20), rgba(var(--purple),.05));
    border: 1px solid rgba(var(--purple),.30);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  }
  .wf-glass::after { content: ''; position: absolute; left: 14%; top: 8%; width: 46%; height: 34%; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,.35), transparent 70%); }
  .wf-icon { position: relative; z-index: 2; color: #fff; display: grid; place-items: center; will-change: transform; }

  .wf-circle.is-hover { transform: scale(1.08) translateY(-6px); box-shadow: 0 22px 60px rgba(139,92,246,.35), inset 0 1px 1px rgba(255,255,255,.22); }

  /* Active AI node */
  .wf-circle.is-active .wf-glass { border-color: rgba(230,57,70,.55); background: linear-gradient(160deg, rgba(230,57,70,.22), rgba(230,57,70,.05)); }
  .wf-circle.is-active { box-shadow: 0 0 46px rgba(230,57,70,.55), 0 12px 44px rgba(230,57,70,.35), inset 0 1px 1px rgba(255,255,255,.22); }
  .wf-ring { position: absolute; inset: -7px; border-radius: 50%; z-index: 1;
    background: conic-gradient(from 0deg, transparent, rgba(230,57,70,.9), transparent 55%, rgba(139,92,246,.7), transparent);
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); }
  .wf-ripple { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid rgba(230,57,70,.6); }
  .wf-pulse { position: absolute; inset: -2px; border-radius: 50%; box-shadow: 0 0 34px rgba(230,57,70,.5); }

  .wf-node-title { margin-top: 22px; font-size: 16px; font-weight: 700; color: #fff; }
  .wf-node-title.is-active { color: var(--red); }
  .wf-node-desc { margin-top: 6px; font-size: 12.5px; line-height: 1.5; color: rgba(255,255,255,.42); max-width: 150px; }

  /* Hover card */
  .wf-card {
    position: absolute; top: 168px; left: 50%; transform: translateX(-50%); width: 280px; z-index: 20;
    padding: 18px; border-radius: 16px; text-align: left;
    background: rgba(22,24,34,.72); -webkit-backdrop-filter: blur(18px); backdrop-filter: blur(18px);
    border: 1px solid rgba(255,255,255,.10); box-shadow: 0 30px 70px rgba(0,0,0,.5);
  }
  .wf-card::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%) rotate(45deg);
    width: 12px; height: 12px; background: rgba(22,24,34,.72); border-left: 1px solid rgba(255,255,255,.10); border-top: 1px solid rgba(255,255,255,.10); }
  .wf-card-head { display: flex; align-items: center; gap: 8px; }
  .wf-card-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(139,92,246,.9); }
  .wf-card-dot.is-active { background: var(--red); box-shadow: 0 0 10px rgba(230,57,70,.9); }
  .wf-card-title { font-size: 15px; font-weight: 700; color: #fff; }
  .wf-card-desc { margin: 10px 0 14px; font-size: 12.5px; line-height: 1.55; color: rgba(255,255,255,.55); }
  .wf-card-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .wf-card-meta div { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.07); border-radius: 10px; padding: 8px 10px; }
  .wf-card-meta span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: rgba(255,255,255,.4); }
  .wf-card-meta b { font-size: 13px; color: #fff; font-weight: 700; }
  .wf-card-metrics { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
  .wf-card-metrics li { position: relative; padding-left: 18px; font-size: 12px; color: rgba(255,255,255,.7); }
  .wf-card-metrics li::before { content: ''; position: absolute; left: 0; top: 5px; width: 8px; height: 8px; border-radius: 50%;
    background: rgba(52,211,153,.9); box-shadow: 0 0 8px rgba(52,211,153,.7); }

  /* Responsive */
  @media (max-width: 1100px) {
    .wf { padding: 100px 28px 90px; }
    .wf-inner { grid-template-columns: 1fr; gap: 56px; }
    .wf-title { font-size: 52px; }
    .wf-rail { left: 8%; right: 8%; }
    .wf-circle { width: 78px; height: 78px; }
    .wf-node-desc { display: none; }
    .wf-card { display: none; }
  }
`;
