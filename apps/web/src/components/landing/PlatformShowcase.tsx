'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Layers, BrainCircuit, UserCheck, FileCheck2,
  Check, Zap, ShieldCheck, ArrowUpRight, Activity,
} from 'lucide-react';

const RED = '#E63946';
const EASE = [0.22, 0.8, 0.2, 1] as const;

type Step = {
  key: string; label: string; Icon: typeof FlaskConical;
  stage: string; specimenLine: string; progress: number;
  pill: string; pillColor: string; pillBg: string;
  log: string;
};

const STEPS: Step[] = [
  { key: 'collect', label: 'Collect', Icon: FlaskConical, stage: 'Accessioning',
    specimenLine: 'Barcode validated · chain of custody logged', progress: 16,
    pill: 'Received', pillColor: '#4F46E5', pillBg: 'rgba(99,102,241,.12)',
    log: 'Specimen DM26-07-914 accessioned' },
  { key: 'process', label: 'Process', Icon: Layers, stage: 'Digital imaging',
    specimenLine: 'Whole-slide scan · 40× · quality verified', progress: 42,
    pill: 'Imaging', pillColor: '#4F46E5', pillBg: 'rgba(99,102,241,.12)',
    log: 'Slide prepared and digitally scanned' },
  { key: 'ai', label: 'AI Analysis', Icon: BrainCircuit, stage: 'Deep-learning inference',
    specimenLine: '12.8M cells analyzed · high-risk regions flagged', progress: 74,
    pill: 'Analyzing', pillColor: RED, pillBg: 'rgba(230,57,70,.12)',
    log: 'AI screening complete — 98.4% confidence' },
  { key: 'review', label: 'Review', Icon: UserCheck, stage: 'Pathologist verification',
    specimenLine: 'Board-certified sign-out · AI second read', progress: 91,
    pill: 'In Review', pillColor: '#7C3AED', pillBg: 'rgba(124,58,237,.12)',
    log: 'Pathologist verifying flagged regions' },
  { key: 'report', label: 'Report', Icon: FileCheck2, stage: 'Structured reporting',
    specimenLine: 'CAP-compliant · FHIR delivered to LIS', progress: 100,
    pill: 'Complete', pillColor: '#059669', pillBg: 'rgba(16,185,129,.12)',
    log: 'Report signed and delivered' },
];

// Per-step metric targets (index by active step).
const PENDING = [47, 45, 43, 41, 38];
const CONFIDENCE = [94.1, 95.8, 98.4, 98.4, 98.4];
const REPORTS = [1204, 1204, 1204, 1206, 1209];

const RULES = [
  { dot: '#10B981', title: 'Auto-route high-confidence → Sign-out', count: '1,204× today' },
  { dot: RED, title: 'Flag atypical → Senior pathologist', count: '38× today' },
  { dot: '#6366F1', title: 'STAT specimens → Priority lane', count: '12× today' },
];

// Smoothly tween a number toward its target whenever `value` changes.
function useTween(value: number, dur = 900) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const start = useRef(0);
  useEffect(() => {
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      if (!start.current) start.current = t;
      const p = Math.min(1, (t - start.current) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(a + (b - a) * e);
      if (p < 1) raf = requestAnimationFrame(step);
      else { from.current = b; start.current = 0; }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return display;
}

function Stat({ label, value, decimals = 0, suffix = '', accent, sub, max }: {
  label: string; value: number; decimals?: number; suffix?: string; accent: string; sub: string; max: number;
}) {
  const v = useTween(value);
  return (
    <div className="ps-stat">
      <div className="ps-stat-label">{label}</div>
      <div className="ps-stat-value">
        {v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
      </div>
      <div className="ps-stat-bar"><motion.span style={{ background: accent }}
        animate={{ width: `${Math.min(100, (value / max) * 100)}%` }} transition={{ duration: 0.9, ease: EASE }} /></div>
      <div className="ps-stat-sub" style={{ color: accent }}>{sub}</div>
    </div>
  );
}

export default function PlatformShowcase() {
  const [active, setActive] = useState(2);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 9000);
    return () => clearInterval(id);
  }, [paused]);

  const s = STEPS[active];
  const fillPct = (active / (STEPS.length - 1)) * 100;

  return (
    <div className="ps">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ps-glow ps-glow-a" />
      <div className="ps-glow ps-glow-b" />

      {/* Headline */}
      <motion.div className="ps-head"
        initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-120px' }} transition={{ duration: 0.7, ease: EASE }}>
        <div className="ps-eyebrow">Live platform</div>
        <h2 className="ps-title">One platform. Every step <em>connected.</em></h2>
        <p className="ps-lede">
          Watch a specimen move through CYTOLAB in real time — from accessioning to
          AI screening to a signed, structured report. One continuous, intelligent pipeline.
        </p>
      </motion.div>

      {/* Cinematic dashboard */}
      <motion.div className="ps-stage"
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}>
        <motion.div className="ps-drift"
          animate={{ rotateX: [0, 1.1, 0, -0.9, 0], rotateY: [0, -1.4, 0, 1.2, 0], y: [0, -6, 0, 4, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          <div className="ps-card">
            <div className="ps-sheen" />

            {/* Header */}
            <div className="ps-topbar">
              <div className="ps-brand">
                <span className="ps-logo">CY</span>
                <div>
                  <div className="ps-brand-name">CYTOLAB Pipeline</div>
                  <div className="ps-brand-sub">Autonomous specimen workflow</div>
                </div>
              </div>
              <div className="ps-live"><span className="ps-live-dot" /> Live System</div>
            </div>

            {/* Pipeline timeline */}
            <div className="ps-section-label ps-pipe-title">Specimen pipeline</div>
            <div className="ps-pipe">
              <div className="ps-pipe-track">
                <motion.div className="ps-pipe-fill" animate={{ width: `${fillPct}%` }} transition={{ duration: 0.8, ease: EASE }} />
              </div>
              {STEPS.map((st, i) => {
                const done = i < active, cur = i === active;
                return (
                  <button key={st.key} className="ps-node-wrap" onClick={() => setActive(i)} aria-label={st.label}>
                    <motion.span className={`ps-node ${done ? 'done' : ''} ${cur ? 'cur' : ''}`}
                      animate={cur ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                      transition={cur ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}>
                      {done ? <Check size={16} strokeWidth={3} /> : <st.Icon size={18} strokeWidth={1.9} />}
                      {cur && <span className="ps-node-ring" />}
                    </motion.span>
                    <span className={`ps-node-label ${cur ? 'cur' : ''}`}>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="ps-body">
              {/* Now processing */}
              <div className="ps-now">
                <div className="ps-now-head">
                  <div>
                    <div className="ps-section-label">Now processing</div>
                    <div className="ps-specimen">DM26-07-914 · Cervical Scrape</div>
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.span key={s.key} className="ps-pill"
                      style={{ color: s.pillColor, background: s.pillBg }}
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.3, ease: EASE }}>
                      <span className="ps-pill-dot" style={{ background: s.pillColor }} />{s.pill}
                    </motion.span>
                  </AnimatePresence>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div key={s.key} className="ps-stage-row"
                    initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.35, ease: EASE }}>
                    <span className="ps-stage-ic" style={{ color: s.pillColor, background: s.pillBg }}>
                      <s.Icon size={18} strokeWidth={1.9} />
                    </span>
                    <div>
                      <div className="ps-stage-name">{s.stage}</div>
                      <div className="ps-stage-desc">{s.specimenLine}</div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="ps-prog">
                  <div className="ps-prog-track"><motion.span className="ps-prog-fill"
                    animate={{ width: `${s.progress}%` }} transition={{ duration: 0.9, ease: EASE }} /></div>
                  <span className="ps-prog-num">{s.progress}%</span>
                </div>

                <div className="ps-log">
                  <Activity size={13} />
                  <AnimatePresence mode="wait">
                    <motion.span key={s.key}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.3 }}>{s.log}</motion.span>
                  </AnimatePresence>
                </div>
              </div>

              {/* Live metrics */}
              <div className="ps-metrics">
                <Stat label="Pending Cases" value={PENDING[active]} accent="#6366F1" sub="in queue" max={60} />
                <Stat label="AI Confidence" value={CONFIDENCE[active]} decimals={1} suffix="%" accent={RED} sub="mean this run" max={100} />
                <Stat label="Completed Reports" value={REPORTS[active]} accent="#059669" sub="today" max={1400} />
              </div>
            </div>

            {/* Automation rules */}
            <div className="ps-rules-head">
              <span className="ps-section-label">Automation rules</span>
              <a href="#demo" className="ps-configure">Configure rules <ArrowUpRight size={13} /></a>
            </div>
            <div className="ps-rules">
              {RULES.map((r) => (
                <div key={r.title} className="ps-rule">
                  <span className="ps-rule-dot" style={{ background: r.dot }} />
                  <div className="ps-rule-body">
                    <div className="ps-rule-title">{r.title}</div>
                    <div className="ps-rule-count">Triggered {r.count}</div>
                  </div>
                  <span className="ps-rule-active"><Zap size={11} /> Active</span>
                </div>
              ))}
            </div>
          </div>

          {/* Floating micro-cards for depth */}
          <motion.div className="ps-float ps-float-a"
            animate={{ y: [0, -10, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
            <ShieldCheck size={16} color="#059669" /><div><b>HIPAA + CAP</b><span>Compliant by design</span></div>
          </motion.div>
          <motion.div className="ps-float ps-float-b"
            animate={{ y: [0, 9, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
            <Zap size={16} color={RED} /><div><b>14 sec</b><span>AI turnaround</span></div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

const CSS = `
  .ps {
    position: relative; width: 100%; padding: 120px 56px 130px; overflow: hidden; isolation: isolate;
    background: radial-gradient(1200px 700px at 50% -10%, #ffffff, #f4f5fb 55%, #eef0f7 100%);
    font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #0F172A;
  }
  .ps-glow { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; }
  .ps-glow-a { width: 620px; height: 620px; left: 8%; top: 30%; background: radial-gradient(circle, rgba(230,57,70,.08), transparent 70%); }
  .ps-glow-b { width: 560px; height: 560px; right: 6%; bottom: 4%; background: radial-gradient(circle, rgba(99,102,241,.10), transparent 70%); }

  .ps-head { position: relative; z-index: 2; max-width: 720px; margin: 0 auto 56px; text-align: center; }
  .ps-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${RED}; }
  .ps-title { margin: 16px 0 0; font-size: 52px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; }
  .ps-title em { font-style: italic; color: ${RED}; }
  .ps-lede { margin: 18px auto 0; max-width: 560px; font-size: 17px; line-height: 1.65; color: #64748B; }

  .ps-stage { position: relative; z-index: 2; max-width: 1240px; margin: 0 auto; perspective: 1800px; }
  .ps-drift { transform-style: preserve-3d; position: relative; }

  .ps-card {
    position: relative; border-radius: 28px; padding: 30px 34px 34px; overflow: hidden;
    background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,.72));
    -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);
    border: 1px solid rgba(15,23,42,.06);
    box-shadow: 0 2px 6px rgba(15,23,42,.04), 0 40px 90px -30px rgba(15,23,42,.28), inset 0 1px 0 rgba(255,255,255,.7);
  }
  .ps-sheen { position: absolute; top: 0; left: -40%; width: 40%; height: 100%; pointer-events: none; z-index: 5;
    background: linear-gradient(105deg, transparent, rgba(255,255,255,.5), transparent);
    animation: ps-sheen 7s ease-in-out infinite; }
  @keyframes ps-sheen { 0%, 45% { transform: translateX(0); } 90%, 100% { transform: translateX(360%); } }

  .ps-topbar { display: flex; align-items: center; justify-content: space-between; }
  .ps-brand { display: flex; align-items: center; gap: 12px; }
  .ps-logo { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 13px; letter-spacing: .02em;
    background: linear-gradient(180deg, #F0555F, #C42B38); box-shadow: 0 8px 20px rgba(230,57,70,.32); }
  .ps-brand-name { font-size: 16px; font-weight: 800; letter-spacing: -.01em; }
  .ps-brand-sub { font-size: 12px; color: #94A3B8; margin-top: 1px; }
  .ps-live { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: #059669;
    background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.2); border-radius: 999px; padding: 6px 12px; }
  .ps-live-dot { width: 7px; height: 7px; border-radius: 50%; background: #10B981; animation: ps-ping 2s infinite; }
  @keyframes ps-ping { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.5); } 70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }

  .ps-section-label { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #94A3B8; }
  .ps-pipe-title { margin-top: 26px; }

  .ps-pipe { position: relative; display: flex; margin: 16px 0 4px; }
  .ps-pipe-track { position: absolute; top: 24px; left: 10%; right: 10%; height: 3px; border-radius: 3px; background: #E7E9F2; }
  .ps-pipe-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 3px;
    background: linear-gradient(90deg, ${RED}, #ff6b73); box-shadow: 0 0 12px rgba(230,57,70,.4); }
  .ps-node-wrap { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; align-items: center; gap: 12px; border: none; background: none; cursor: pointer; padding: 0; }
  .ps-node { position: relative; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center;
    background: #fff; border: 2px solid #E7E9F2; color: #94A3B8; transition: all .35s cubic-bezier(.22,.8,.2,1); }
  .ps-node.done { background: #0F172A; border-color: #0F172A; color: #fff; }
  .ps-node.cur { background: ${RED}; border-color: ${RED}; color: #fff; box-shadow: 0 10px 26px rgba(230,57,70,.4); }
  .ps-node-ring { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(230,57,70,.4); animation: ps-ring 2.4s ease-out infinite; }
  @keyframes ps-ring { 0% { transform: scale(1); opacity: .6; } 100% { transform: scale(1.5); opacity: 0; } }
  .ps-node-label { font-size: 13px; font-weight: 600; color: #94A3B8; }
  .ps-node-label.cur { color: ${RED}; font-weight: 700; }

  .ps-body { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; margin: 28px 0 6px; }
  .ps-now { border-radius: 18px; padding: 20px; background: rgba(248,249,253,.8); border: 1px solid rgba(15,23,42,.05); }
  .ps-now-head { display: flex; align-items: flex-start; justify-content: space-between; }
  .ps-specimen { font-size: 17px; font-weight: 800; letter-spacing: -.01em; margin-top: 6px; }
  .ps-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 999px; }
  .ps-pill-dot { width: 6px; height: 6px; border-radius: 50%; }
  .ps-stage-row { display: flex; align-items: center; gap: 12px; margin: 18px 0 16px; }
  .ps-stage-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; flex-shrink: 0; }
  .ps-stage-name { font-size: 15px; font-weight: 700; }
  .ps-stage-desc { font-size: 13px; color: #64748B; margin-top: 2px; }
  .ps-prog { display: flex; align-items: center; gap: 12px; }
  .ps-prog-track { flex: 1; height: 8px; border-radius: 999px; background: #E7E9F2; overflow: hidden; }
  .ps-prog-fill { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, ${RED}, #ff7a80); }
  .ps-prog-num { font-size: 13px; font-weight: 800; font-variant-numeric: tabular-nums; color: #0F172A; width: 42px; text-align: right; }
  .ps-log { display: flex; align-items: center; gap: 8px; margin-top: 16px; font-size: 12.5px; color: #64748B; }
  .ps-log svg { color: ${RED}; flex-shrink: 0; }

  .ps-metrics { display: flex; flex-direction: column; gap: 12px; }
  .ps-stat { border-radius: 16px; padding: 16px 18px; background: #fff; border: 1px solid rgba(15,23,42,.05); box-shadow: 0 8px 24px -14px rgba(15,23,42,.2); }
  .ps-stat-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #94A3B8; }
  .ps-stat-value { font-size: 30px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; margin: 4px 0 8px; }
  .ps-stat-bar { height: 5px; border-radius: 999px; background: #EEF0F7; overflow: hidden; }
  .ps-stat-bar span { display: block; height: 100%; border-radius: 999px; }
  .ps-stat-sub { font-size: 11.5px; font-weight: 600; margin-top: 7px; }

  .ps-rules-head { display: flex; align-items: center; justify-content: space-between; margin: 26px 0 12px; }
  .ps-configure { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; color: #4F46E5; text-decoration: none; }
  .ps-rules { display: flex; flex-direction: column; gap: 10px; }
  .ps-rule { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,.7); border: 1px solid rgba(15,23,42,.05); transition: transform .3s cubic-bezier(.22,.8,.2,1), box-shadow .3s; }
  .ps-rule:hover { transform: translateY(-2px); box-shadow: 0 14px 30px -16px rgba(15,23,42,.3); }
  .ps-rule-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .ps-rule-body { flex: 1; }
  .ps-rule-title { font-size: 14px; font-weight: 700; }
  .ps-rule-count { font-size: 12px; color: #94A3B8; margin-top: 2px; }
  .ps-rule-active { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #059669; background: rgba(16,185,129,.1); border-radius: 999px; padding: 4px 10px; }

  .ps-float { position: absolute; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 16px; z-index: 6;
    background: rgba(255,255,255,.92); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    border: 1px solid rgba(15,23,42,.06); box-shadow: 0 20px 44px -18px rgba(15,23,42,.4); }
  .ps-float b { display: block; font-size: 14px; font-weight: 800; }
  .ps-float span { font-size: 11.5px; color: #94A3B8; }
  .ps-float-a { left: -34px; top: 128px; }
  .ps-float-b { right: -30px; bottom: 96px; }

  @media (max-width: 1000px) {
    .ps { padding: 80px 22px 90px; }
    .ps-title { font-size: 38px; }
    .ps-card { padding: 22px; border-radius: 22px; }
    .ps-body { grid-template-columns: 1fr; }
    .ps-float, .ps-node-label { display: none; }
    .ps-node { width: 40px; height: 40px; }
    .ps-pipe-track, .ps-pipe-fill { top: 20px; }
  }
`;
