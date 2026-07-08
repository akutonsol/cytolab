'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, FolderOpen, ListChecks, FileText, LineChart,
  MousePointer2, Hand, ZoomIn, Maximize2, Play, Pause, Check,
  TestTube2, BrainCircuit, User, FileCheck2, UploadCloud,
  Microscope, Clock, Building2, Activity, Sparkles, ChevronDown, Sun, Crosshair,
  ChevronLeft, ChevronRight, ArrowRight,
} from 'lucide-react';

import { EASE } from '@cytolab/animations';

const RED = '#E63946';

// Decorative biological field behind the dashboard — purple cell clusters + RBCs.
const BIO = [
  { t: 'purple', x: '-2%', y: '24%', s: 150, o: 0.9 },
  { t: 'purple', x: '4%', y: '52%', s: 120, o: 0.8 },
  { t: 'purple', x: '89%', y: '14%', s: 130, o: 0.85 },
  { t: 'purple', x: '95%', y: '42%', s: 150, o: 0.9 },
  { t: 'rbc', x: '11%', y: '12%', s: 46, o: 1 },
  { t: 'rbc', x: '21%', y: '5%', s: 30, o: 0.9 },
  { t: 'rbc', x: '80%', y: '20%', s: 40, o: 1 },
  { t: 'rbc', x: '91%', y: '58%', s: 46, o: 1 },
  { t: 'rbc', x: '6%', y: '40%', s: 36, o: 1 },
  { t: 'rbc', x: '84%', y: '76%', s: 34, o: 0.95 },
];

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: FolderOpen, label: 'Cases' },
  { icon: ListChecks, label: 'Worklist' },
  { icon: FileText, label: 'Reports' },
  { icon: LineChart, label: 'Analytics' },
];

// The five pipeline stages that drive the ENTIRE dashboard. Clicking a stage (or
// autoplay) sets `active`; the slide viewer, case progress, stats and foot all
// re-derive from it — turning the static mockup into a real click-through tour.
type Overlay = 'review' | 'report' | 'delivered' | null;
type Stage = {
  Icon: typeof TestTube2; label: string; sub: string; // pipeline node
  navIndex: number; pill: string; pillTint: 'violet' | 'green' | 'red';
  detections: boolean; scanning: boolean; overlay: Overlay;
  badge: { title: string; sub: string } | null;
  confidence: string; cells: string; atypical: string; foot: string;
};
const STAGES: Stage[] = [
  {
    Icon: TestTube2, label: 'Specimen Received', sub: 'Accessioned and ready for analysis',
    navIndex: 1, pill: 'Accessioned', pillTint: 'green', detections: false, scanning: false, overlay: null,
    badge: null, confidence: '—', cells: '0', atypical: '0',
    foot: 'Specimen C-24-89321 accessioned · queued for AI screening',
  },
  {
    Icon: BrainCircuit, label: 'AI Screening', sub: 'Deep learning models analyze millions of cells',
    navIndex: 2, pill: 'AI Screening', pillTint: 'violet', detections: true, scanning: true, overlay: null,
    badge: { title: 'HSIL Detected', sub: 'Confidence 98.4%' }, confidence: '98.4', cells: '14,672', atypical: '18',
    foot: 'AI model v3.2 · analyzing millions of cells in real time…',
  },
  {
    Icon: User, label: 'Pathologist Review', sub: 'Expert validation with AI insights',
    navIndex: 2, pill: 'In Review', pillTint: 'red', detections: true, scanning: false, overlay: 'review',
    badge: { title: 'HSIL Detected', sub: 'Confidence 98.4%' }, confidence: '98.4', cells: '14,672', atypical: '18',
    foot: 'Case auto-routed to Dr. Sarah Mitchell for validation',
  },
  {
    Icon: FileCheck2, label: 'Report Generated', sub: 'Structured, CAP-compliant report created',
    navIndex: 3, pill: 'Report Ready', pillTint: 'violet', detections: false, scanning: false, overlay: 'report',
    badge: null, confidence: '98.4', cells: '14,672', atypical: '18',
    foot: 'Structured, CAP-compliant report generated and signed out',
  },
  {
    Icon: UploadCloud, label: 'Delivered', sub: 'Seamlessly sent to LIS / EHR',
    navIndex: 3, pill: 'Delivered', pillTint: 'green', detections: false, scanning: false, overlay: 'delivered',
    badge: null, confidence: '98.4', cells: '14,672', atypical: '18',
    foot: 'Report delivered to LIS / EHR · case complete',
  },
];

// Case-progress column labels (one per stage).
const CASE = [
  { label: 'Specimen Received', time: '10:21 AM', activeSub: 'Accessioning specimen…' },
  { label: 'AI Screening', time: '10:23 AM', activeSub: 'Scanning cells…', pct: '98%' },
  { label: 'Pathologist Review', time: '10:31 AM', activeSub: 'Validating findings…' },
  { label: 'Report Generation', time: '10:44 AM', activeSub: 'Generating report…' },
  { label: 'Completed', time: '10:45 AM', activeSub: 'Finalizing…' },
];

const KPIS = [
  { Icon: Microscope, value: '99.9%', label: 'Detection Accuracy', sub: 'Across all classes' },
  { Icon: Clock, value: '2.0', unit: 'hrs', label: 'Average Turnaround', sub: 'Time' },
  { Icon: Building2, value: '500+', label: 'Laboratories', sub: 'Worldwide' },
  { Icon: FileText, value: '12.8M+', label: 'Slides Processed', sub: 'Annually' },
];

const CERTS = [
  { a: 'HIPAA', b: 'COMPLIANT' },
  { a: 'SOC 2', b: 'TYPE II' },
  { a: 'CAP', b: 'ACCREDITED' },
  { a: 'CLIA', b: 'COMPLIANT' },
];

const DETECTIONS = [
  { top: '8%', left: '38%', w: '13%', h: '18%' },
  { top: '30%', left: '18%', w: '11%', h: '16%' },
  { top: '35%', left: '55%', w: '11%', h: '17%' },
  { top: '58%', left: '30%', w: '13%', h: '19%' },
  { top: '52%', left: '62%', w: '10%', h: '15%' },
];

export default function PlatformShowcase() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = STAGES[active];

  // Autoplay: advance through the pipeline while playing, looping at the end.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 2800);
    return () => clearInterval(t);
  }, [playing]);

  const go = (i: number) => { setActive(((i % STAGES.length) + STAGES.length) % STAGES.length); };
  const goManual = (i: number) => { setPlaying(false); go(i); };

  return (
    <div className="ps">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Decorative biology */}
      <div className="ps-bio" aria-hidden>
        {BIO.map((c, i) => (
          <span key={i} className={`ps-orb ps-${c.t}`} style={{ left: c.x, top: c.y, width: c.s, height: c.s, opacity: c.o }} />
        ))}
      </div>

      {/* Headline */}
      <motion.div className="ps-head"
        initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-120px' }} transition={{ duration: 0.7, ease: EASE }}>
        <div className="ps-eyebrow">Interactive Walkthrough <span className="ps-eyebrow-dot" /></div>
        <h2 className="ps-title">One platform.<br />Every step <em>connected.</em></h2>
        <p className="ps-lede">
          Click any stage below to walk a specimen through CYTOLAB — from accessioning to
          AI screening to a signed, structured report. Or press play for the full tour.
        </p>
        <Link href="/experience" className="ps-launch">
          Launch the full interactive experience <ArrowRight size={16} />
        </Link>
      </motion.div>

      {/* ── DASHBOARD CARD ── */}
      <motion.div className="ps-dash"
        initial={{ opacity: 0, y: 44 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}>

        {/* Top bar */}
        <div className="ps-top">
          <div className="ps-brand">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
              {Array.from({ length: 8 }).map((_, i) => {
                const a = (i / 8) * Math.PI * 2;
                return <circle key={i} cx={16 + 9 * Math.cos(a)} cy={16 + 9 * Math.sin(a)} r={2.4} fill={RED} />;
              })}
              <circle cx="16" cy="16" r="2.8" fill={RED} />
            </svg>
            <span className="ps-brand-name">CYTOLAB</span>
          </div>
          <nav className="ps-nav">
            {NAV.map((n, i) => (
              <span key={n.label} className={`ps-tab ${i === stage.navIndex ? 'is-active' : ''}`}>
                <n.icon size={15} strokeWidth={2} />{n.label}
              </span>
            ))}
          </nav>
          <div className="ps-top-right">
            <span className="ps-livesys"><span className="ps-livesys-dot" /> LIVE SYSTEM <Activity size={13} /></span>
            <span className="ps-avatar">DR</span>
          </div>
        </div>

        {/* Body */}
        <div className="ps-grid">
          {/* Slide viewer */}
          <div className="ps-slide">
            <div className="ps-slide-head">
              <span className="ps-slide-id">Slide: <b>C-24-89321</b></span>
              <span className={`ps-slide-pill tint-${stage.pillTint}`}>{stage.pill}</span>
              <Crosshair size={16} className="ps-slide-target" />
            </div>
            <div className="ps-slide-body">
              <img src="/cytology-sample.png" alt="" className="ps-slide-img" />
              <div className="ps-slide-tools">
                {[MousePointer2, Hand, ZoomIn, Maximize2].map((I, i) => (
                  <span key={i} className={`ps-tool ${i === 0 ? 'is-on' : ''}`}><I size={16} strokeWidth={2} /></span>
                ))}
              </div>

              {stage.scanning && <span className="ps-scan" />}

              {stage.badge && (
                <div className="ps-hsil"><b>{stage.badge.title}</b><span>{stage.badge.sub}</span></div>
              )}
              {stage.detections && DETECTIONS.map((d, i) => (
                <div key={i} className="ps-detect" style={{ top: d.top, left: d.left, width: d.w, height: d.h }} />
              ))}

              {/* Start-tour affordance — only on the first stage while paused */}
              {active === 0 && !playing && (
                <button className="ps-play" onClick={() => setPlaying(true)} aria-label="Play walkthrough">
                  <span className="ps-play-btn"><Play size={26} fill={RED} color={RED} /></span>
                  <span className="ps-play-label">Play walkthrough</span>
                  <span className="ps-play-time">5 steps · ~15s</span>
                </button>
              )}

              {/* Stage-specific overlays */}
              {stage.overlay === 'review' && (
                <div className="ps-ov ps-ov-review">
                  <span className="av">SM</span>
                  <span><b>Dr. Sarah Mitchell</b><span>Reviewing findings…</span></span>
                </div>
              )}
              {stage.overlay === 'report' && (
                <div className="ps-ov ps-ov-report">
                  <div className="rep-head"><FileCheck2 size={14} /> Cytology Report</div>
                  <div className="rep-body">
                    <div className="rep-row"><span>Specimen</span><b>C-24-89321</b></div>
                    <div className="rep-row"><span>Finding</span><b className="rep-hsil">HSIL</b></div>
                    <div className="rep-row"><span>Bethesda</span><b>Epithelial abnormality</b></div>
                    <div className="rep-sign"><Check size={12} strokeWidth={3} /> Signed · Dr. S. Mitchell</div>
                  </div>
                </div>
              )}
              {stage.overlay === 'delivered' && (
                <div className="ps-ov ps-ov-delivered">
                  <span className="circle"><Check size={30} color="#22c55e" strokeWidth={3} /></span>
                  <b>Delivered to LIS / EHR</b>
                  <span>Case C-24-89321 complete</span>
                </div>
              )}

              <div className="ps-slide-foot">
                <span className="ps-mini"><img src="/cytology-sample.png" alt="" /><span className="ps-mini-box" /></span>
                <span className="ps-zoom">40x <ChevronDown size={13} /></span>
                <span className="ps-slide-foot-r"><Sun size={15} /><Maximize2 size={15} /></span>
              </div>
            </div>
          </div>

          {/* Case progress */}
          <div className="ps-prog">
            <div className="ps-col-title">Case Progress</div>
            <div className="ps-steps">
              {CASE.map((s, i) => {
                const state = i < active ? 'done' : i === active ? 'active' : 'pending';
                return (
                  <div key={s.label} className={`ps-step ${state}`}>
                    {i < CASE.length - 1 && <span className="ps-step-line" />}
                    <span className="ps-step-dot">{state === 'done' ? <Check size={11} strokeWidth={3.2} /> : null}</span>
                    <div className="ps-step-body">
                      <div className="ps-step-row">
                        <span className="ps-step-label">{s.label}</span>
                        {state === 'done' && <span className="ps-step-time">{s.time}</span>}
                        {state === 'active' && s.pct && <span className="ps-step-check"><Check size={13} strokeWidth={2.5} /></span>}
                      </div>
                      {state === 'active' && <div className="ps-step-sub">{s.activeSub}{s.pct && <b>  {s.pct}</b>}</div>}
                      {state === 'pending' && <div className="ps-step-sub">Pending</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stat cards */}
          <div className="ps-stats-col">
            <div className="ps-mini-card">
              <div className="ps-mini-head"><span className="ps-mini-label">AI Confidence</span><span className="ps-mini-pill">{stage.confidence === '—' ? 'Idle' : 'High'}</span></div>
              <div className="ps-mini-value">{stage.confidence}<span>{stage.confidence === '—' ? '' : '%'}</span></div>
              <svg className="ps-spark" viewBox="0 0 120 34" preserveAspectRatio="none">
                <defs><linearGradient id="psConf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
                <polygon points="0,26 15,22 30,24 45,16 60,19 75,11 90,14 105,7 120,4 120,34 0,34" fill="url(#psConf)" />
                <polyline points="0,26 15,22 30,24 45,16 60,19 75,11 90,14 105,7 120,4" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="ps-mini-card">
              <span className="ps-mini-label">Cells Analyzed</span>
              <div className="ps-mini-value">{stage.cells}</div>
              <div className="ps-mini-trend">{active === 0 ? 'Awaiting screening' : '↑ +12% vs last 15 min'}</div>
            </div>
            <div className="ps-mini-card">
              <span className="ps-mini-label">Atypical Cells</span>
              <div className="ps-mini-value">{stage.atypical}</div>
              <svg className="ps-spark ps-spark-sm" viewBox="0 0 120 26" preserveAspectRatio="none">
                <defs><linearGradient id="psAty" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={RED} stopOpacity="0.35" /><stop offset="100%" stopColor={RED} stopOpacity="0" /></linearGradient></defs>
                <polygon points="0,18 20,15 40,17 60,10 80,13 100,7 120,5 120,26 0,26" fill="url(#psAty)" />
                <polyline points="0,18 20,15 40,17 60,10 80,13 100,7 120,5" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* Foot */}
        <div className="ps-foot">
          <span className="ps-foot-l"><Sparkles size={13} color="#a78bfa" /> {stage.foot}</span>
          <span className="ps-foot-r">Just now</span>
        </div>
      </motion.div>

      {/* ── WALKTHROUGH CONTROLS ── */}
      <div className="ps-controls">
        <button className="ps-ctrl-btn" onClick={() => goManual(active - 1)} aria-label="Previous stage"><ChevronLeft size={18} /></button>
        <button className="ps-ctrl-btn ps-ctrl-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={20} fill="#fff" /> : <Play size={20} fill="#fff" />}
        </button>
        <button className="ps-ctrl-btn" onClick={() => goManual(active + 1)} aria-label="Next stage"><ChevronRight size={18} /></button>
        <div className="ps-ctrl-meta">
          <div className="ps-ctrl-stage">{stage.label}</div>
          <div className="ps-ctrl-count">Step {active + 1} of {STAGES.length}{playing ? ' · playing' : ''}</div>
        </div>
        <div className="ps-dots">
          {STAGES.map((s, i) => (
            <button key={s.label} className={`ps-dot ${i === active ? 'is-on' : ''}`} onClick={() => goManual(i)} aria-label={`Go to ${s.label}`} />
          ))}
        </div>
      </div>

      {/* ── PIPELINE (clickable) ── */}
      <div className="ps-flow">
        {STAGES.map((p, i) => {
          const state = i < active ? 'is-done' : i === active ? 'is-active' : '';
          return (
            <button key={p.label} className="ps-flow-node" onClick={() => goManual(i)} aria-label={`Go to ${p.label}`}>
              <div className="ps-flow-circle-wrap">
                <div className={`ps-flow-circle ${state}`}>
                  <p.Icon size={26} strokeWidth={1.8} color={i === active ? RED : i < active ? '#22c55e' : '#64748b'} />
                  {i < active && <span className="ps-flow-badge"><Check size={11} strokeWidth={3.4} /></span>}
                  {i === active && <span className="ps-flow-ring" />}
                </div>
                {i < STAGES.length - 1 && (
                  <div className="ps-flow-arrow"><span className={`ps-flow-line ${i < active ? 'is-done' : ''}`} /><span className="ps-flow-head" /></div>
                )}
              </div>
              <div className={`ps-flow-label ${i === active ? 'is-active' : ''}`}>{p.label}</div>
              <div className="ps-flow-sub">{p.sub}</div>
            </button>
          );
        })}
      </div>

      {/* ── KPIs + COMPLIANCE ── */}
      <div className="ps-kpis">
        <div className="ps-kpi-group">
          {KPIS.map((k) => (
            <div key={k.label} className="ps-kpi">
              <span className="ps-kpi-ic"><k.Icon size={22} color="#7c3aed" strokeWidth={2} /></span>
              <div>
                <div className="ps-kpi-value">{k.value}{k.unit && <em>{k.unit}</em>}</div>
                <div className="ps-kpi-label">{k.label}</div>
                <div className="ps-kpi-sub">{k.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="ps-certs">
          {CERTS.map((c) => (
            <div key={c.a} className="ps-cert"><span className="ps-cert-a">{c.a}</span><span className="ps-cert-b">{c.b}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .ps { position: relative; width: 100%; padding: 72px 40px 96px; overflow: hidden; isolation: isolate;
    background: radial-gradient(1300px 720px at 50% -6%, #ffffff, #f5f1fb 55%, #efe9f9 100%);
    font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #0F172A; }

  /* Decorative biology */
  .ps-bio { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .ps-orb { position: absolute; border-radius: 50%; transform: translate(-50%,-50%); }
  .ps-purple { background: radial-gradient(circle at 38% 34%, rgba(214,190,250,0.55), rgba(150,110,225,0.34) 46%, rgba(112,72,192,0.16) 70%, transparent 80%);
    filter: blur(1px); box-shadow: 0 0 46px rgba(160,120,240,0.28); }
  .ps-rbc { background: radial-gradient(circle at 50% 50%, rgba(176,26,46,0.85) 0%, rgba(230,57,70,0.9) 42%, rgba(255,112,124,0.9) 72%, rgba(228,70,86,0.7) 100%);
    box-shadow: 0 8px 20px rgba(230,57,70,0.32), inset 0 0 10px rgba(120,0,20,0.45); }

  .ps-head { position: relative; z-index: 2; max-width: 760px; margin: 0 auto 44px; text-align: center; }
  .ps-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; color: ${RED}; }
  .ps-eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: ${RED}; box-shadow: 0 0 8px rgba(230,57,70,.6); }
  .ps-title { margin: 14px 0 0; font-size: 60px; line-height: 1.02; font-weight: 800; letter-spacing: -.035em; }
  .ps-title em { font-style: italic; color: ${RED}; }
  .ps-lede { margin: 20px auto 0; max-width: 540px; font-size: 16px; line-height: 1.6; color: #64748B; }
  .ps-launch { display: inline-flex; align-items: center; gap: 8px; margin-top: 22px; font-size: 14.5px; font-weight: 700; color: #fff; text-decoration: none;
    background: ${RED}; border-radius: 11px; padding: 12px 22px; box-shadow: 0 12px 28px -10px rgba(230,57,70,.6); transition: transform .15s ease, box-shadow .15s ease; }
  .ps-launch:hover { transform: translateY(-2px); box-shadow: 0 18px 36px -12px rgba(230,57,70,.7); }

  /* Dashboard card */
  .ps-dash { position: relative; z-index: 2; max-width: 1200px; margin: 0 auto; border-radius: 26px; overflow: hidden;
    background: linear-gradient(165deg, #1c1638 0%, #150f28 58%, #1a1333 100%);
    border: 1px solid rgba(255,255,255,.08);
    box-shadow: 0 40px 100px -34px rgba(40,20,80,.55), 0 8px 26px rgba(20,10,40,.3), 0 0 0 1px rgba(255,255,255,.5); }

  .ps-top { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid rgba(255,255,255,.07); }
  .ps-brand { display: flex; align-items: center; gap: 9px; }
  .ps-brand-name { font-size: 16px; font-weight: 800; letter-spacing: .02em; color: #fff; }
  .ps-nav { display: flex; align-items: center; gap: 4px; }
  .ps-tab { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,.5); padding: 7px 13px; border-radius: 9px; transition: color .25s ease, background .25s ease; }
  .ps-tab.is-active { color: #fff; background: rgba(255,255,255,.09); }
  .ps-top-right { display: flex; align-items: center; gap: 12px; }
  .ps-livesys { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #22c55e;
    background: rgba(34,197,94,.13); border: 1px solid rgba(34,197,94,.28); border-radius: 999px; padding: 5px 11px; }
  .ps-livesys-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: ps-blink 1.5s ease-in-out infinite; }
  @keyframes ps-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
  .ps-avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff;
    background: linear-gradient(150deg, #F0555F, #C42B38); box-shadow: 0 4px 12px rgba(230,57,70,.4); }

  .ps-grid { display: grid; grid-template-columns: minmax(0,1.62fr) minmax(0,1fr) minmax(0,0.9fr); gap: 16px; padding: 18px; }

  /* Slide viewer */
  .ps-slide { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
  .ps-slide-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .ps-slide-id { font-size: 12px; color: rgba(255,255,255,.55); } .ps-slide-id b { color: #fff; font-weight: 700; }
  .ps-slide-pill { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 10px; transition: all .25s ease; }
  .ps-slide-pill.tint-violet { color: #c4b5fd; background: rgba(139,92,246,.18); border: 1px solid rgba(139,92,246,.3); }
  .ps-slide-pill.tint-green { color: #6ee7b7; background: rgba(34,197,94,.16); border: 1px solid rgba(34,197,94,.32); }
  .ps-slide-pill.tint-red { color: #fda4af; background: rgba(230,57,70,.18); border: 1px solid rgba(230,57,70,.34); }
  .ps-slide-target { color: rgba(255,255,255,.5); margin-left: auto; }
  .ps-slide-body { position: relative; flex: 1; min-height: 340px; }
  .ps-slide-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.05); }
  .ps-slide-tools { position: absolute; left: 12px; top: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 4; }
  .ps-tool { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; color: rgba(255,255,255,.85);
    background: rgba(20,15,35,.55); border: 1px solid rgba(255,255,255,.12); backdrop-filter: blur(6px); }
  .ps-tool.is-on { background: rgba(230,57,70,.85); border-color: transparent; color: #fff; }
  .ps-hsil { position: absolute; top: 22%; left: 8%; z-index: 4; background: ${RED}; color: #fff; border-radius: 10px; padding: 7px 12px; box-shadow: 0 8px 22px rgba(230,57,70,.5); animation: ps-fade .4s ease; }
  .ps-hsil b { display: block; font-size: 12.5px; font-weight: 800; } .ps-hsil span { font-size: 10.5px; opacity: .9; }
  .ps-detect { position: absolute; z-index: 3; border: 1.5px solid rgba(230,57,70,.9); border-radius: 4px; box-shadow: 0 0 10px rgba(230,57,70,.35); animation: ps-fade .4s ease; }
  .ps-scan { position: absolute; left: 0; right: 0; top: 0; height: 2px; z-index: 5; background: linear-gradient(90deg, transparent, rgba(167,139,250,.95), transparent); box-shadow: 0 0 12px rgba(139,92,246,.8); animation: ps-scanmove 2.2s ease-in-out infinite; }
  @keyframes ps-scanmove { 0%{top:4%;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{top:94%;opacity:0} }
  @keyframes ps-fade { from{opacity:0} to{opacity:1} }

  .ps-play { position: absolute; top: 50%; left: 58%; transform: translate(-50%,-50%); z-index: 6; text-align: center; display: grid; justify-items: center; background: none; border: none; cursor: pointer; }
  .ps-play-btn { display: grid; place-items: center; width: 74px; height: 74px; margin: 0 auto; border-radius: 50%; background: #fff;
    box-shadow: 0 0 0 6px rgba(230,57,70,.28), 0 0 34px rgba(230,57,70,.5); animation: ps-pulse 2.4s ease-out infinite; }
  @keyframes ps-pulse { 0%{box-shadow:0 0 0 4px rgba(230,57,70,.4),0 0 24px rgba(230,57,70,.5)} 70%{box-shadow:0 0 0 16px rgba(230,57,70,0),0 0 24px rgba(230,57,70,.3)} 100%{box-shadow:0 0 0 4px rgba(230,57,70,0),0 0 24px rgba(230,57,70,.3)} }
  .ps-play-label { margin-top: 12px; font-size: 14px; font-weight: 700; color: #fff; text-shadow: 0 2px 8px rgba(0,0,0,.5); }
  .ps-play-time { font-size: 12px; color: rgba(255,255,255,.75); text-shadow: 0 2px 8px rgba(0,0,0,.5); }

  /* Stage overlays */
  .ps-ov { z-index: 6; animation: ps-fade .45s ease; }
  .ps-ov-review { position: absolute; right: 14px; bottom: 58px; display: flex; align-items: center; gap: 10px;
    background: rgba(20,15,35,.82); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 9px 13px; backdrop-filter: blur(8px); }
  .ps-ov-review .av { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff; background: linear-gradient(150deg,#8b5cf6,#6d28d9); }
  .ps-ov-review b { font-size: 12.5px; color: #fff; display: block; } .ps-ov-review span span, .ps-ov-review > span > span { font-size: 11px; color: rgba(255,255,255,.6); }
  .ps-ov-report { position: absolute; top: 50%; left: 56%; transform: translate(-50%,-50%); width: 224px; background: #fff; border-radius: 13px; box-shadow: 0 24px 60px rgba(0,0,0,.45); overflow: hidden; }
  .ps-ov-report .rep-head { display: flex; align-items: center; gap: 7px; padding: 10px 13px; font-size: 12.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg,#7c3aed,#5b21b6); }
  .ps-ov-report .rep-body { padding: 12px 13px 13px; }
  .ps-ov-report .rep-row { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #64748b; padding: 4px 0; }
  .ps-ov-report .rep-row b { color: #0f172a; font-weight: 700; } .ps-ov-report .rep-hsil { color: ${RED}; }
  .ps-ov-report .rep-sign { margin-top: 8px; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; color: #16a34a; background: rgba(34,197,94,.12); border-radius: 7px; padding: 5px 9px; }
  .ps-ov-delivered { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 6px; text-align: center;
    background: radial-gradient(circle at 50% 45%, rgba(10,8,20,.55), rgba(10,8,20,.82)); }
  .ps-ov-delivered .circle { width: 74px; height: 74px; border-radius: 50%; background: rgba(34,197,94,.16); border: 1px solid rgba(34,197,94,.5); display: grid; place-items: center; margin-bottom: 6px; }
  .ps-ov-delivered b { font-size: 15px; color: #fff; } .ps-ov-delivered > span:last-child { font-size: 12px; color: rgba(255,255,255,.6); }

  .ps-slide-foot { position: absolute; left: 0; right: 0; bottom: 0; z-index: 7; display: flex; align-items: center; gap: 12px; padding: 10px 12px;
    background: linear-gradient(0deg, rgba(15,10,28,.85), transparent); }
  .ps-mini { position: relative; width: 66px; height: 46px; border-radius: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,.25); }
  .ps-mini img { width: 100%; height: 100%; object-fit: cover; } .ps-mini-box { position: absolute; top: 30%; left: 22%; width: 26%; height: 34%; border: 1.5px solid ${RED}; border-radius: 2px; }
  .ps-zoom { margin: 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #fff; background: rgba(255,255,255,.1); border-radius: 7px; padding: 5px 10px; }
  .ps-slide-foot-r { display: inline-flex; gap: 10px; color: rgba(255,255,255,.75); }

  /* Case progress */
  .ps-prog { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07); border-radius: 16px; padding: 18px; }
  .ps-col-title { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 18px; }
  .ps-steps { display: flex; flex-direction: column; }
  .ps-step { position: relative; display: flex; gap: 13px; padding-bottom: 22px; }
  .ps-step-line { position: absolute; left: 8px; top: 20px; bottom: -2px; width: 2px; background: rgba(255,255,255,.1); }
  .ps-step.done .ps-step-line { background: rgba(34,197,94,.4); }
  .ps-step-dot { position: relative; z-index: 1; width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
    background: rgba(255,255,255,.08); border: 2px solid rgba(255,255,255,.2); color: #fff; transition: all .3s ease; }
  .ps-step.done .ps-step-dot { background: #22c55e; border-color: #22c55e; }
  .ps-step.active .ps-step-dot { background: #8b5cf6; border-color: #8b5cf6; box-shadow: 0 0 0 4px rgba(139,92,246,.22); }
  .ps-step-body { flex: 1; }
  .ps-step-row { display: flex; align-items: center; gap: 8px; }
  .ps-step-label { font-size: 13.5px; font-weight: 600; color: #fff; }
  .ps-step.pending .ps-step-label { color: rgba(255,255,255,.5); }
  .ps-step-time { margin-left: auto; font-size: 11px; color: rgba(255,255,255,.4); }
  .ps-step-check { margin-left: auto; color: #a78bfa; }
  .ps-step-sub { font-size: 12px; color: rgba(255,255,255,.4); margin-top: 3px; }
  .ps-step.active .ps-step-sub { color: rgba(196,181,253,.9); }
  .ps-step.active .ps-step-sub b { color: #fff; font-weight: 700; float: right; }

  /* Stat cards */
  .ps-stats-col { display: flex; flex-direction: column; gap: 14px; }
  .ps-mini-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: 14px 16px; position: relative; overflow: hidden; }
  .ps-mini-head { display: flex; align-items: center; justify-content: space-between; }
  .ps-mini-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.5); }
  .ps-mini-pill { font-size: 10px; font-weight: 700; color: #22c55e; background: rgba(34,197,94,.16); border-radius: 999px; padding: 2px 8px; }
  .ps-mini-value { font-size: 30px; font-weight: 800; color: #fff; letter-spacing: -.02em; margin-top: 6px; line-height: 1; }
  .ps-mini-value span { font-size: 17px; margin-left: 1px; }
  .ps-mini-trend { font-size: 11.5px; color: #22c55e; margin-top: 8px; }
  .ps-spark { width: 100%; height: 34px; margin-top: 10px; display: block; }
  .ps-spark-sm { height: 26px; }

  .ps-foot { display: flex; align-items: center; justify-content: space-between; padding: 12px 22px; border-top: 1px solid rgba(255,255,255,.07); }
  .ps-foot-l { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: rgba(255,255,255,.55); }
  .ps-foot-r { font-size: 12px; color: rgba(255,255,255,.4); }

  /* Walkthrough controls */
  .ps-controls { position: relative; z-index: 2; max-width: 1200px; margin: 22px auto 0; display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; }
  .ps-ctrl-btn { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #fff; border: 1px solid #e7e3f2; color: #0f172a; cursor: pointer; box-shadow: 0 6px 16px -8px rgba(60,40,120,.35); transition: transform .15s ease, border-color .15s ease; }
  .ps-ctrl-btn:hover { border-color: ${RED}; transform: translateY(-1px); }
  .ps-ctrl-play { width: 48px; height: 48px; background: ${RED}; border-color: transparent; color: #fff; box-shadow: 0 10px 22px -8px rgba(230,57,70,.6); }
  .ps-ctrl-play:hover { border-color: transparent; }
  .ps-ctrl-meta { min-width: 176px; text-align: center; }
  .ps-ctrl-stage { font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -.01em; }
  .ps-ctrl-count { font-size: 11px; color: #94a3b8; margin-top: 2px; letter-spacing: .04em; }
  .ps-dots { display: inline-flex; gap: 7px; }
  .ps-dot { width: 8px; height: 8px; border-radius: 50%; background: #d9d3e8; border: none; cursor: pointer; padding: 0; transition: all .2s ease; }
  .ps-dot.is-on { background: ${RED}; transform: scale(1.3); }

  /* Pipeline (clickable) */
  .ps-flow { position: relative; z-index: 2; max-width: 1160px; margin: 44px auto 0; display: grid; grid-template-columns: repeat(5,1fr); }
  .ps-flow-node { text-align: center; padding: 8px 6px; background: none; border: none; font: inherit; cursor: pointer; width: 100%; }
  .ps-flow-circle-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .ps-flow-circle { position: relative; width: 66px; height: 66px; border-radius: 50%; display: grid; place-items: center; background: #fff; border: 1.5px solid #e7e3f2; box-shadow: 0 8px 22px -10px rgba(60,40,120,.28); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .ps-flow-node:hover .ps-flow-circle { transform: translateY(-3px); box-shadow: 0 14px 30px -12px rgba(60,40,120,.4); }
  .ps-flow-circle.is-done { border-color: #22c55e; }
  .ps-flow-circle.is-active { border-color: ${RED}; box-shadow: 0 0 0 5px rgba(230,57,70,.1), 0 0 28px rgba(230,57,70,.28); }
  .ps-flow-badge { position: absolute; top: -3px; right: -3px; width: 20px; height: 20px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; display: grid; place-items: center; color: #fff; }
  .ps-flow-ring { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(230,57,70,.4); animation: ps-ring 2.4s ease-out infinite; }
  @keyframes ps-ring { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.35);opacity:0} }
  .ps-flow-arrow { position: absolute; left: calc(50% + 40px); right: calc(-50% + 40px); top: 33px; display: flex; align-items: center; }
  .ps-flow-line { flex: 1; height: 1.5px; background: #d9d3e8; transition: background .3s ease; }
  .ps-flow-line.is-done { background: rgba(34,197,94,.55); }
  .ps-flow-head { width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid #d9d3e8; margin-left: -1px; }
  .ps-flow-label { margin-top: 16px; font-size: 15px; font-weight: 700; color: #0f172a; }
  .ps-flow-label.is-active { color: ${RED}; }
  .ps-flow-sub { margin-top: 5px; font-size: 12.5px; line-height: 1.45; color: #94a3b8; max-width: 180px; margin-left: auto; margin-right: auto; }

  /* KPIs + compliance */
  .ps-kpis { position: relative; z-index: 2; max-width: 1200px; margin: 64px auto 0; background: #fff; border: 1px solid #eee7f4; border-radius: 20px;
    box-shadow: 0 18px 50px -24px rgba(60,40,120,.22); padding: 22px 24px; display: flex; align-items: center; gap: 20px; }
  .ps-kpi-group { display: flex; gap: 6px; flex: 1; flex-wrap: nowrap; }
  .ps-kpi { display: flex; align-items: center; gap: 11px; padding: 4px 8px; flex: 1; }
  .ps-kpi-ic { width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0; display: grid; place-items: center;
    background: linear-gradient(135deg, rgba(139,92,246,.16), rgba(124,58,237,.08)); border: 1px solid rgba(139,92,246,.14); }
  .ps-kpi-value { font-size: 23px; font-weight: 800; letter-spacing: -.02em; color: #0a0b1a; line-height: 1; white-space: nowrap; }
  .ps-kpi-value em { font-size: 13px; font-weight: 700; font-style: normal; color: #475569; margin-left: 2px; }
  .ps-kpi-label { font-size: 12.5px; font-weight: 600; color: #334155; margin-top: 4px; white-space: nowrap; }
  .ps-kpi-sub { font-size: 11px; color: #94a3b8; }
  .ps-certs { display: flex; gap: 8px; flex-shrink: 0; }
  .ps-cert { min-width: 68px; text-align: center; border: 1px solid #e6e1f0; border-radius: 12px; padding: 9px 7px; }
  .ps-cert-a { display: block; font-size: 14px; font-weight: 800; color: #33334d; }
  .ps-cert-b { display: block; font-size: 8.5px; font-weight: 700; letter-spacing: .1em; color: #9090ac; margin-top: 2px; }

  @media (max-width: 1080px) {
    .ps { padding: 56px 20px 72px; }
    .ps-title { font-size: 40px; }
    .ps-grid { grid-template-columns: 1fr; }
    .ps-flow { grid-template-columns: repeat(2,1fr); gap: 32px 8px; } .ps-flow-arrow { display: none; }
    .ps-kpis { flex-direction: column; align-items: stretch; } .ps-kpi-group { flex-wrap: wrap; } .ps-certs { flex-wrap: wrap; }
  }
`;
