'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, FolderOpen, ListChecks, FileText, LineChart,
  MousePointer2, Hand, ZoomIn, Maximize2, Check,
  TestTube2, BrainCircuit, User, FileCheck2, UploadCloud,
  Microscope, Clock, Building2, Activity, Sparkles, ChevronDown, Sun, Crosshair,
  ChevronLeft, ChevronRight, ArrowRight,
} from 'lucide-react';

import { EASE } from '@cytolab/animations';

const RED = '#E63946';

// Decorative biological field behind the dashboard — purple cell clusters + RBCs.
const BIO = [
  { t: 'purple', x: '3%', y: '38%', s: 180, o: 0.9 },
  { t: 'purple', x: '91%', y: '14%', s: 138, o: 0.72 },
  { t: 'purple', x: '96%', y: '43%', s: 154, o: 0.78 },
  { t: 'purple', x: '88%', y: '48%', s: 104, o: 0.58 },
  { t: 'rbc', x: '8%', y: '13%', s: 52, o: 1 },
  { t: 'rbc', x: '16%', y: '17%', s: 32, o: 0.9 },
  { t: 'rbc', x: '79%', y: '15%', s: 48, o: 1 },
  { t: 'rbc', x: '90%', y: '32%', s: 36, o: 0.95 },
  { t: 'rbc', x: '8%', y: '55%', s: 42, o: 1 },
  { t: 'rbc', x: '88%', y: '57%', s: 42, o: 0.96 },
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
    foot: 'Specimen C-24-89321 accessioned · queued for review',
  },
  {
    Icon: BrainCircuit, label: 'AI Draft Assist', sub: 'Human-reviewed draft narratives',
    navIndex: 2, pill: 'AI Draft', pillTint: 'violet', detections: false, scanning: false, overlay: null,
    badge: null, confidence: '—', cells: '0', atypical: '0',
    foot: 'Draft narrative generated for pathologist review',
  },
  {
    Icon: User, label: 'Pathologist Review', sub: 'Pathologist validates and signs out',
    navIndex: 2, pill: 'In Review', pillTint: 'red', detections: false, scanning: false, overlay: 'review',
    badge: null, confidence: '—', cells: '0', atypical: '0',
    foot: 'Case routed to Dr. Sarah Mitchell for sign-out',
  },
  {
    Icon: FileCheck2, label: 'Report Generated', sub: 'Structured report created',
    navIndex: 3, pill: 'Report Ready', pillTint: 'violet', detections: false, scanning: false, overlay: 'report',
    badge: null, confidence: '—', cells: '0', atypical: '0',
    foot: 'Structured report generated and signed out',
  },
  {
    Icon: UploadCloud, label: 'Delivered', sub: 'Seamlessly sent to LIS / EHR',
    navIndex: 3, pill: 'Delivered', pillTint: 'green', detections: false, scanning: false, overlay: 'delivered',
    badge: null, confidence: '—', cells: '0', atypical: '0',
    foot: 'Report delivered to LIS / EHR · case complete',
  },
];

// Case-progress column labels (one per stage).
const CASE = [
  { label: 'Specimen Received', time: '10:21 AM', activeSub: 'Accessioning specimen…' },
  { label: 'AI Draft Assist', time: '10:23 AM', activeSub: 'Drafting narrative…', pct: '98%' },
  { label: 'Pathologist Review', time: '10:31 AM', activeSub: 'Validating findings…' },
  { label: 'Report Generation', time: '10:44 AM', activeSub: 'Generating report…' },
  { label: 'Completed', time: '10:45 AM', activeSub: 'Finalizing…' },
];

const KPIS = [
  { Icon: Microscope, value: '100%', label: 'Human sign-out', sub: 'Every case' },
  { Icon: Clock, value: '2.0', unit: 'hrs', label: 'Average Turnaround', sub: 'Time' },
  { Icon: Building2, value: '500+', label: 'Laboratories', sub: 'Worldwide' },
  { Icon: FileText, value: '12.8M+', label: 'Slides Processed', sub: 'Annually' },
];

const CERTS = [
  { a: 'HIPAA', b: 'ALIGNED' },
  { a: 'SOC2', b: 'ROADMAP' },
  { a: 'CLIA', b: 'ROADMAP' },
  { a: 'CAP', b: 'ROADMAP' },
  { a: 'FDA', b: 'ROADMAP' },
  { a: 'Encryption', b: 'AES-256' },
  { a: 'Audit Trail', b: 'ENABLED' },
  { a: 'RBAC', b: 'POLICY' },
  { a: 'Zero Trust', b: 'SECURITY' },
];

const AUDIENCES = ['Hospitals', 'Labs', 'Research', 'Reference Labs', 'Biotech', 'Pharma'];

const DETECTIONS = [
  { top: '8%', left: '38%', w: '13%', h: '18%' },
  { top: '30%', left: '18%', w: '11%', h: '16%' },
  { top: '35%', left: '55%', w: '11%', h: '17%' },
  { top: '58%', left: '30%', w: '13%', h: '19%' },
  { top: '52%', left: '62%', w: '10%', h: '15%' },
];

export default function PlatformShowcase() {
  const [active, setActive] = useState(0);
  const [playing] = useState(true);
  const stage = STAGES[active];

  // Autoplay: advance through the pipeline while playing, looping at the end.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 2800);
    return () => clearInterval(t);
  }, [playing]);

  const go = (i: number) => { setActive(((i % STAGES.length) + STAGES.length) % STAGES.length); };
  const goManual = (i: number) => { go(i); };

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
        <div className="ps-eyebrow">Live Platform <span className="ps-eyebrow-dot" /></div>
        <h2 className="ps-title">One platform.<br />Every step <em>connected.</em></h2>
        <p className="ps-lede">
          Watch a specimen move through the platform in real time — from accessioning to
          AI-assisted drafting to a signed, structured report. One continuous, intelligent pipeline.
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
            <span className="ps-brand-name">Osieri</span>
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
              <div className="ps-mini-head"><span className="ps-mini-label">Draft status</span><span className="ps-mini-pill">{stage.confidence === '—' ? 'Idle' : 'Ready'}</span></div>
              <div className="ps-mini-value">{stage.confidence}<span>{stage.confidence === '—' ? '' : '%'}</span></div>
              <svg className="ps-spark" viewBox="0 0 120 34" preserveAspectRatio="none">
                <defs><linearGradient id="psConf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
                <polygon points="0,26 15,22 30,24 45,16 60,19 75,11 90,14 105,7 120,4 120,34 0,34" fill="url(#psConf)" />
                <polyline points="0,26 15,22 30,24 45,16 60,19 75,11 90,14 105,7 120,4" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="ps-mini-card">
              <span className="ps-mini-label">Cases in queue</span>
              <div className="ps-mini-value">{stage.cells}</div>
              <div className="ps-mini-trend">{active === 0 ? 'Awaiting review' : '↑ +12% vs last 15 min'}</div>
            </div>
            <div className="ps-mini-card">
              <span className="ps-mini-label">Flagged for review</span>
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

      {/* ── MODULE STATUS ── */}
      <div className="ps-modules">
        <div className="ps-modules-head">
          <span>Osieri Modules</span>
          <span className="ps-modules-live"><i /> Live activity</span>
        </div>
        <div className="ps-module-card">
          <span className="ps-module-icon"><BrainCircuit size={24} strokeWidth={1.9} /></span>
          <div className="ps-module-copy">
            <div className="ps-module-name">AI Draft Assist</div>
            <div className="ps-module-sub">live activity</div>
          </div>
          <div className="ps-module-divider" />
          <div className="ps-module-count">
            <strong>432</strong>
            <span>cases running</span>
          </div>
        </div>
      </div>

      <div className="ps-audiences" aria-label="Osieri audiences">
        <span className="ps-audiences-label">Built for</span>
        <div className="ps-audience-list">
          {AUDIENCES.map((audience) => (
            <span key={audience} className="ps-audience-chip">{audience}</span>
          ))}
        </div>
      </div>

      <div className="ps-proof" aria-label="Customer outcome">
        <div className="ps-proof-brand">
          <span className="ps-proof-name">Mayo</span>
          <span className="ps-proof-stars" aria-label="Five star rating">★★★★★</span>
        </div>
        <div className="ps-proof-metrics">
          <div className="ps-proof-metric">
            <span>Reduced turnaround</span>
            <strong>43%</strong>
          </div>
          <div className="ps-proof-metric">
            <span>Saved</span>
            <strong>180 <em>hours/month</em></strong>
          </div>
        </div>
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
        <div className="ps-security">
          <div className="ps-security-head">
            <span>Security & Compliance</span>
            <span>Enterprise controls active across every workflow</span>
          </div>
          <div className="ps-certs">
            {CERTS.map((c) => (
              <div key={c.a} className="ps-cert"><span className="ps-cert-a">{c.a}</span><span className="ps-cert-b">{c.b}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
  .ps { position: relative; width: 100%; padding: 64px 24px 138px; min-height: 1580px; overflow: hidden; isolation: isolate;
    background:
      radial-gradient(980px 520px at 50% 18%, rgba(255,255,255,.96), rgba(255,255,255,.68) 42%, rgba(245,239,255,.22) 74%, transparent 100%),
      radial-gradient(1180px 760px at 50% 43%, rgba(247,205,217,.26), rgba(224,205,255,.28) 44%, transparent 72%),
      linear-gradient(180deg, #ffffff 0%, #fbf8ff 38%, #f3edf9 100%);
    font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #0F172A; }
  .ps::before, .ps::after { content: ''; position: absolute; left: 50%; top: 33%; width: 980px; height: 500px; transform: translate(-50%,-50%);
    border-radius: 50%; z-index: 0; pointer-events: none; }
  .ps::before { border: 1px solid rgba(230,57,70,.10); box-shadow: inset 0 0 70px rgba(230,57,70,.05); }
  .ps::after { width: 1160px; height: 620px; border: 1px solid rgba(139,92,246,.10); box-shadow: inset 0 0 82px rgba(139,92,246,.055); opacity: .86; }

  /* Decorative biology */
  .ps-bio { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .ps-orb { position: absolute; border-radius: 50%; transform: translate(-50%,-50%); }
  .ps-purple { background:
      radial-gradient(circle at 42% 38%, rgba(255,255,255,.56) 0 10%, rgba(185,139,248,.44) 22%, rgba(132,82,213,.28) 47%, rgba(112,72,192,.12) 70%, transparent 82%),
      radial-gradient(circle at 60% 52%, rgba(90,45,165,.26), transparent 38%);
    filter: blur(.35px); box-shadow: 0 22px 60px rgba(160,120,240,0.20), inset 0 0 26px rgba(124,58,237,.08); }
  .ps-rbc { border-radius: 48% 52% 45% 55%; background:
      radial-gradient(ellipse at 48% 47%, rgba(124,12,30,.42) 0 24%, transparent 30%),
      radial-gradient(circle at 38% 28%, rgba(255,155,162,.82), transparent 28%),
      radial-gradient(circle at 50% 54%, rgba(230,57,70,0.94) 0%, rgba(205,31,52,0.96) 56%, rgba(255,118,126,0.72) 100%);
    box-shadow: 0 12px 24px rgba(230,57,70,0.28), inset 0 0 11px rgba(120,0,20,0.42); }

  .ps-head { position: relative; z-index: 2; max-width: 760px; margin: 0 auto 38px; text-align: center; }
  .ps-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; color: ${RED}; }
  .ps-eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: ${RED}; box-shadow: 0 0 8px rgba(230,57,70,.6); }
  .ps-title { margin: 12px 0 0; font-size: 66px; line-height: .96; font-weight: 850; letter-spacing: -.04em; }
  .ps-title em { font-style: italic; color: ${RED}; }
  .ps-lede { margin: 18px auto 0; max-width: 590px; font-size: 16.5px; line-height: 1.5; color: #4c5575; font-weight: 500; }
  .ps-launch { display: inline-flex; align-items: center; gap: 8px; margin-top: 22px; font-size: 14.5px; font-weight: 750; color: #fff; text-decoration: none;
    background: ${RED}; border-radius: 11px; padding: 12px 22px; box-shadow: 0 14px 30px -12px rgba(230,57,70,.64), inset 0 1px 0 rgba(255,255,255,.22);
    transition: transform .15s ease, box-shadow .15s ease; }
  .ps-launch:hover { transform: translateY(-2px); box-shadow: 0 20px 40px -14px rgba(230,57,70,.74), inset 0 1px 0 rgba(255,255,255,.26); }

  /* Dashboard card */
  .ps-dash { position: relative; z-index: 2; width: min(1320px, calc(100vw - 64px)); margin: 0 auto; border-radius: 22px; overflow: hidden;
    background:
      radial-gradient(820px 360px at 48% -24%, rgba(139,92,246,.22), transparent 64%),
      linear-gradient(165deg, #171329 0%, #11101f 56%, #17122c 100%);
    border: 1px solid rgba(255,255,255,.10);
    box-shadow: 0 34px 74px -30px rgba(25,16,55,.62), 0 8px 22px rgba(20,10,40,.28), 0 0 0 1px rgba(124,58,237,.48), inset 0 1px 0 rgba(255,255,255,.08); }

  .ps-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,.075); }
  .ps-brand { display: flex; align-items: center; gap: 9px; }
  .ps-brand-name { font-size: 16px; font-weight: 800; letter-spacing: .02em; color: #fff; }
  .ps-nav { display: flex; align-items: center; gap: 4px; }
  .ps-tab { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 650; color: rgba(255,255,255,.5); padding: 7px 12px; border-radius: 9px; transition: color .25s ease, background .25s ease; }
  .ps-tab.is-active { color: #fff; background: rgba(255,255,255,.105); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
  .ps-top-right { display: flex; align-items: center; gap: 12px; }
  .ps-livesys { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .04em; color: #22c55e;
    background: rgba(34,197,94,.13); border: 1px solid rgba(34,197,94,.28); border-radius: 999px; padding: 5px 11px; }
  .ps-livesys-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; animation: ps-blink 1.5s ease-in-out infinite; }
  @keyframes ps-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
  .ps-avatar { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: #fff;
    background: linear-gradient(150deg, #F0555F, #C42B38); box-shadow: 0 4px 12px rgba(230,57,70,.4); }

  .ps-grid { display: grid; grid-template-columns: minmax(0,1.72fr) minmax(0,.82fr) minmax(0,.76fr); gap: 15px; padding: 16px 16px 15px; }

  /* Slide viewer */
  .ps-slide { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.085); border-radius: 15px; overflow: hidden; display: flex; flex-direction: column;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.055); }
  .ps-slide-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  .ps-slide-id { font-size: 12px; color: rgba(255,255,255,.55); } .ps-slide-id b { color: #fff; font-weight: 700; }
  .ps-slide-pill { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 10px; transition: all .25s ease; }
  .ps-slide-pill.tint-violet { color: #c4b5fd; background: rgba(139,92,246,.18); border: 1px solid rgba(139,92,246,.3); }
  .ps-slide-pill.tint-green { color: #6ee7b7; background: rgba(34,197,94,.16); border: 1px solid rgba(34,197,94,.32); }
  .ps-slide-pill.tint-red { color: #fda4af; background: rgba(230,57,70,.18); border: 1px solid rgba(230,57,70,.34); }
  .ps-slide-target { color: rgba(255,255,255,.5); margin-left: auto; }
  .ps-slide-body { position: relative; flex: 1; min-height: 330px; }
  .ps-slide-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(1.14) contrast(1.03) brightness(1.03); }
  .ps-slide-tools { position: absolute; left: 12px; top: 12px; display: flex; flex-direction: column; gap: 8px; z-index: 4; }
  .ps-tool { width: 31px; height: 31px; border-radius: 8px; display: grid; place-items: center; color: rgba(255,255,255,.85);
    background: rgba(20,15,35,.72); border: 1px solid rgba(255,255,255,.12); }
  .ps-tool.is-on { background: rgba(230,57,70,.85); border-color: transparent; color: #fff; }
  .ps-hsil { position: absolute; top: 22%; left: 8%; z-index: 4; background: ${RED}; color: #fff; border-radius: 10px; padding: 7px 12px; box-shadow: 0 8px 22px rgba(230,57,70,.5); animation: ps-fade .4s ease; }
  .ps-hsil b { display: block; font-size: 12.5px; font-weight: 800; } .ps-hsil span { font-size: 10.5px; opacity: .9; }
  .ps-detect { position: absolute; z-index: 3; border: 1.5px solid rgba(230,57,70,.9); border-radius: 4px; box-shadow: 0 0 10px rgba(230,57,70,.35); animation: ps-fade .4s ease; }
  .ps-scan { position: absolute; left: 0; right: 0; top: 4%; height: 2px; z-index: 5; background: linear-gradient(90deg, transparent, rgba(167,139,250,.95), transparent); box-shadow: 0 0 12px rgba(139,92,246,.8); animation: ps-scanmove 2.2s ease-in-out infinite; will-change: transform, opacity; }
  @keyframes ps-scanmove { 0%{transform:translateY(0);opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{transform:translateY(220px);opacity:0} }
  @keyframes ps-fade { from{opacity:0} to{opacity:1} }

  /* Stage overlays */
  .ps-ov { z-index: 6; animation: ps-fade .45s ease; }
  .ps-ov-review { position: absolute; right: 14px; bottom: 58px; display: flex; align-items: center; gap: 10px;
    background: rgba(20,15,35,.9); border: 1px solid rgba(255,255,255,.14); border-radius: 12px; padding: 9px 13px; }
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
  .ps-prog { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.085); border-radius: 15px; padding: 18px; box-shadow: inset 0 1px 0 rgba(255,255,255,.055); }
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
  .ps-step-label { font-size: 13.5px; font-weight: 650; color: #fff; }
  .ps-step.pending .ps-step-label { color: rgba(255,255,255,.5); }
  .ps-step-time { margin-left: auto; font-size: 11px; color: rgba(255,255,255,.4); }
  .ps-step-check { margin-left: auto; color: #a78bfa; }
  .ps-step-sub { font-size: 12px; color: rgba(255,255,255,.4); margin-top: 3px; }
  .ps-step.active .ps-step-sub { color: rgba(196,181,253,.9); }
  .ps-step.active .ps-step-sub b { color: #fff; font-weight: 700; float: right; }

  /* Stat cards */
  .ps-stats-col { display: flex; flex-direction: column; gap: 14px; }
  .ps-mini-card { background: linear-gradient(180deg, rgba(255,255,255,.055), rgba(255,255,255,.032)); border: 1px solid rgba(255,255,255,.085); border-radius: 14px; padding: 14px 16px; position: relative; overflow: hidden; box-shadow: inset 0 1px 0 rgba(255,255,255,.055); }
  .ps-mini-head { display: flex; align-items: center; justify-content: space-between; }
  .ps-mini-label { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.5); }
  .ps-mini-pill { font-size: 10px; font-weight: 700; color: #22c55e; background: rgba(34,197,94,.16); border-radius: 999px; padding: 2px 8px; }
  .ps-mini-value { font-size: 30px; font-weight: 800; color: #fff; letter-spacing: -.02em; margin-top: 6px; line-height: 1; }
  .ps-mini-value span { font-size: 17px; margin-left: 1px; }
  .ps-mini-trend { font-size: 11.5px; color: #22c55e; margin-top: 8px; }
  .ps-spark { width: 100%; height: 34px; margin-top: 10px; display: block; }
  .ps-spark-sm { height: 26px; }

  .ps-foot { display: flex; align-items: center; justify-content: space-between; padding: 12px 22px; border-top: 1px solid rgba(255,255,255,.07); background: rgba(255,255,255,.018); }
  .ps-foot-l { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: rgba(255,255,255,.55); }
  .ps-foot-r { font-size: 12px; color: rgba(255,255,255,.4); }

  /* Walkthrough controls */
  .ps-controls { position: relative; z-index: 2; max-width: 1200px; margin: 26px auto 0; display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap; }
  .ps-ctrl-btn { display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #fff; border: 1px solid #e7e3f2; color: #0f172a; cursor: pointer; box-shadow: 0 6px 16px -8px rgba(60,40,120,.35); transition: transform .15s ease, border-color .15s ease; }
  .ps-ctrl-btn:hover { border-color: ${RED}; transform: translateY(-1px); }
  .ps-ctrl-meta { min-width: 176px; text-align: center; }
  .ps-ctrl-stage { font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -.01em; }
  .ps-ctrl-count { font-size: 11px; color: #94a3b8; margin-top: 2px; letter-spacing: .04em; }
  .ps-dots { display: inline-flex; gap: 7px; }
  .ps-dot { width: 8px; height: 8px; border-radius: 50%; background: #d9d3e8; border: none; cursor: pointer; padding: 0; transition: all .2s ease; }
  .ps-dot.is-on { background: ${RED}; transform: scale(1.3); }

  /* Pipeline (clickable) */
  .ps-flow { position: relative; z-index: 2; width: min(1320px, calc(100vw - 64px)); margin: 52px auto 0; display: grid; grid-template-columns: repeat(5,1fr); }
  .ps-flow-node { text-align: center; padding: 8px 6px; background: none; border: none; font: inherit; cursor: pointer; width: 100%; }
  .ps-flow-circle-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .ps-flow-circle { position: relative; width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.96); border: 1.5px solid #e6e0f2; box-shadow: 0 14px 30px -16px rgba(60,40,120,.38), inset 0 1px 0 rgba(255,255,255,.95); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
  .ps-flow-node:hover .ps-flow-circle { transform: translateY(-3px); box-shadow: 0 14px 30px -12px rgba(60,40,120,.4); }
  .ps-flow-circle.is-done { border-color: #22c55e; }
  .ps-flow-circle.is-active { border-color: ${RED}; box-shadow: 0 0 0 6px rgba(230,57,70,.10), 0 0 34px rgba(230,57,70,.30), 0 16px 34px -16px rgba(230,57,70,.36); }
  .ps-flow-badge { position: absolute; top: -3px; right: -3px; width: 20px; height: 20px; border-radius: 50%; background: #22c55e; border: 2px solid #fff; display: grid; place-items: center; color: #fff; }
  .ps-flow-ring { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid rgba(230,57,70,.4); animation: ps-ring 2.4s ease-out infinite; }
  @keyframes ps-ring { 0%{transform:scale(1);opacity:.6} 100%{transform:scale(1.35);opacity:0} }
  .ps-flow-arrow { position: absolute; left: calc(50% + 46px); right: calc(-50% + 46px); top: 38px; display: flex; align-items: center; }
  .ps-flow-line { flex: 1; height: 1.5px; background: #d9d3e8; transition: background .3s ease; }
  .ps-flow-line.is-done { background: rgba(34,197,94,.55); }
  .ps-flow-head { width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 6px solid #d9d3e8; margin-left: -1px; }
  .ps-flow-label { margin-top: 18px; font-size: 17px; font-weight: 800; color: #0f172a; letter-spacing: -.015em; }
  .ps-flow-label.is-active { color: ${RED}; }
  .ps-flow-sub { margin-top: 7px; font-size: 14px; line-height: 1.48; color: #64748b; font-weight: 520; max-width: 210px; margin-left: auto; margin-right: auto; }

  /* Module status */
  .ps-modules { position: relative; z-index: 2; width: min(1460px, calc(100vw - 48px)); margin: 64px auto 0; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 24px; align-items: stretch; }
  .ps-modules-head { display: flex; flex-direction: column; justify-content: center; gap: 9px; padding-left: 4px; }
  .ps-modules-head > span:first-child { color: #0f172a; font-size: 20px; font-weight: 850; letter-spacing: -.025em; }
  .ps-modules-live { width: fit-content; display: inline-flex; align-items: center; gap: 8px; color: #e63946; font-size: 11px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
  .ps-modules-live i { width: 8px; height: 8px; border-radius: 50%; background: #e63946; box-shadow: 0 0 11px rgba(230,57,70,.72); animation: ps-blink 1.5s ease-in-out infinite; }
  .ps-module-card { min-height: 112px; display: grid; grid-template-columns: auto minmax(0, 1fr) 1px auto; align-items: center; gap: 22px;
    border: 1px solid rgba(226,218,239,.96); border-radius: 24px; background: linear-gradient(180deg, rgba(255,255,255,.94), rgba(250,247,255,.84));
    box-shadow: 0 28px 68px -42px rgba(60,40,120,.38), inset 0 1px 0 rgba(255,255,255,.98); padding: 24px 30px; }
  .ps-module-icon { width: 64px; height: 64px; border-radius: 19px; display: grid; place-items: center; color: #e63946;
    background: linear-gradient(135deg, rgba(230,57,70,.13), rgba(139,92,246,.10)); border: 1px solid rgba(230,57,70,.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.82), 0 18px 36px -26px rgba(230,57,70,.5); }
  .ps-module-copy { min-width: 0; }
  .ps-module-name { color: #0f172a; font-size: 24px; font-weight: 850; letter-spacing: -.025em; line-height: 1.05; }
  .ps-module-sub { margin-top: 6px; color: #64748b; font-size: 13.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; }
  .ps-module-divider { align-self: stretch; background: linear-gradient(180deg, transparent, #e9e2f3 18%, #e9e2f3 82%, transparent); }
  .ps-module-count { min-width: 178px; display: flex; flex-direction: column; align-items: flex-start; }
  .ps-module-count strong { color: #0a0b1a; font-size: 42px; font-weight: 880; letter-spacing: -.04em; line-height: .95; font-variant-numeric: tabular-nums; }
  .ps-module-count span { margin-top: 7px; color: #475569; font-size: 14px; font-weight: 760; white-space: nowrap; }

  .ps-audiences { position: relative; z-index: 2; width: min(1460px, calc(100vw - 48px)); margin: 24px auto 0; display: flex; align-items: center; gap: 18px;
    border: 1px solid rgba(226,218,239,.88); border-radius: 20px; background: rgba(255,255,255,.58);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.78), 0 18px 44px -36px rgba(60,40,120,.28); padding: 16px 18px; }
  .ps-audiences-label { flex: 0 0 auto; color: #64748b; font-size: 12px; font-weight: 850; letter-spacing: .16em; text-transform: uppercase; }
  .ps-audience-list { min-width: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ps-audience-chip { display: inline-flex; align-items: center; min-height: 38px; padding: 0 16px; border-radius: 999px;
    color: #253047; font-size: 14px; font-weight: 760; letter-spacing: -.005em; background: linear-gradient(180deg, rgba(255,255,255,.94), rgba(249,247,255,.82));
    border: 1px solid rgba(226,218,239,.95); box-shadow: inset 0 1px 0 rgba(255,255,255,.92), 0 10px 24px -20px rgba(60,40,120,.36); }

  .ps-proof { position: relative; z-index: 2; width: min(1460px, calc(100vw - 48px)); margin: 24px auto 0; display: grid; grid-template-columns: minmax(220px, .34fr) minmax(0, 1fr); align-items: center; gap: 24px;
    border: 1px solid rgba(226,218,239,.9); border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,.86), rgba(250,247,255,.70));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 22px 54px -42px rgba(60,40,120,.34); padding: 22px 26px; }
  .ps-proof-brand { display: flex; flex-direction: column; gap: 7px; }
  .ps-proof-name { color: #0f172a; font-size: 24px; font-weight: 880; letter-spacing: -.03em; line-height: 1; }
  .ps-proof-stars { color: #e63946; font-size: 16px; letter-spacing: .08em; line-height: 1; text-shadow: 0 0 18px rgba(230,57,70,.18); }
  .ps-proof-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .ps-proof-metric { min-height: 86px; border: 1px solid rgba(226,218,239,.88); border-radius: 16px; background: rgba(255,255,255,.68); padding: 16px 18px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.88); }
  .ps-proof-metric span { display: block; color: #64748b; font-size: 13px; font-weight: 780; letter-spacing: .03em; text-transform: uppercase; }
  .ps-proof-metric strong { display: block; margin-top: 8px; color: #0a0b1a; font-size: 34px; font-weight: 880; letter-spacing: -.04em; line-height: .95; }
  .ps-proof-metric em { font-style: normal; color: #475569; font-size: 15px; font-weight: 760; letter-spacing: -.01em; }

  /* KPIs + compliance */
  .ps-kpis { position: relative; z-index: 2; width: min(1460px, calc(100vw - 48px)); margin: 32px auto 0; background: rgba(255,255,255,.95); border: 1px solid #ece5f4; border-radius: 24px;
    box-shadow: 0 28px 68px -34px rgba(60,40,120,.36), 0 10px 26px -22px rgba(60,40,120,.28), inset 0 1px 0 rgba(255,255,255,.98);
    padding: 30px; display: grid; grid-template-columns: 1fr; gap: 28px; }
  .ps-kpi-group { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; min-width: 0; }
  .ps-kpi { display: flex; align-items: center; gap: 15px; padding: 8px 24px; min-width: 0; border-left: 1px solid #eee8f7; }
  .ps-kpi:first-child { border-left: 0; padding-left: 4px; }
  .ps-kpi-ic { width: 58px; height: 58px; border-radius: 17px; flex-shrink: 0; display: grid; place-items: center;
    background: linear-gradient(135deg, rgba(139,92,246,.18), rgba(124,58,237,.08)); border: 1px solid rgba(139,92,246,.16);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.72), 0 12px 26px -18px rgba(124,58,237,.55); }
  .ps-kpi-value { font-size: 32px; font-weight: 850; letter-spacing: -.03em; color: #0a0b1a; line-height: .96; white-space: nowrap; }
  .ps-kpi-value em { font-size: 15px; font-weight: 750; font-style: normal; color: #475569; margin-left: 3px; }
  .ps-kpi-label { font-size: 14px; font-weight: 750; color: #253047; margin-top: 6px; white-space: nowrap; }
  .ps-kpi-sub { font-size: 12px; color: #7b88a4; margin-top: 2px; white-space: nowrap; }
  .ps-security { border-top: 1px solid #eee8f7; padding-top: 26px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 28px; align-items: start; }
  .ps-security-head { display: flex; flex-direction: column; gap: 7px; padding-top: 4px; }
  .ps-security-head span:first-child { color: #0f172a; font-size: 18px; font-weight: 850; letter-spacing: -.02em; }
  .ps-security-head span:last-child { color: #64748b; font-size: 13px; line-height: 1.45; font-weight: 600; max-width: 240px; }
  .ps-certs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; min-width: 0; }
  .ps-cert { min-width: 0; text-align: left; border: 1px solid #e2daef; border-radius: 14px; padding: 14px 15px; background: linear-gradient(180deg, rgba(255,255,255,.9), rgba(250,248,255,.74));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.92); }
  .ps-cert-a { display: block; font-size: 15px; font-weight: 850; color: #25233d; line-height: 1.1; white-space: nowrap; }
  .ps-cert-b { display: block; font-size: 8.5px; font-weight: 800; letter-spacing: .1em; color: #8b86a5; margin-top: 6px; text-transform: uppercase; white-space: nowrap; }

  @media (max-width: 1080px) {
    .ps { padding: 56px 20px 72px; }
    .ps-title { font-size: 40px; }
    .ps-dash, .ps-flow, .ps-kpis { width: 100%; }
    .ps-grid { grid-template-columns: 1fr; }
    .ps-flow { grid-template-columns: repeat(2,1fr); gap: 32px 8px; } .ps-flow-arrow { display: none; }
    .ps-modules { width: 100%; grid-template-columns: 1fr; gap: 14px; }
    .ps-module-card { grid-template-columns: auto minmax(0, 1fr); }
    .ps-module-divider { display: none; }
    .ps-module-count { grid-column: 1 / -1; min-width: 0; padding-top: 18px; border-top: 1px solid #eee8f7; }
    .ps-audiences { width: 100%; align-items: flex-start; flex-direction: column; }
    .ps-proof { width: 100%; grid-template-columns: 1fr; }
    .ps-proof-metrics { grid-template-columns: 1fr; }
    .ps-kpis { grid-template-columns: 1fr; align-items: stretch; }
    .ps-kpi-group { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ps-kpi { border-left: 0; padding: 8px 10px; }
    .ps-security { grid-template-columns: 1fr; }
    .ps-certs { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-width: 640px) {
    .ps { padding: 48px 16px 64px; min-height: auto; }
    .ps-head { margin-bottom: 28px; text-align: left; }
    .ps-title { font-size: 38px; line-height: 1; }
    .ps-lede { font-size: 15.5px; margin-left: 0; margin-right: 0; }
    .ps-launch { width: 100%; justify-content: center; }
    .ps-dash { width: 100%; border-radius: 18px; }
    .ps-top { align-items: flex-start; gap: 12px; padding: 14px; }
    .ps-brand-name { font-size: 14px; }
    .ps-nav { display: none; }
    .ps-top-right { margin-left: auto; }
    .ps-livesys { font-size: 10px; padding: 5px 8px; }
    .ps-avatar { width: 30px; height: 30px; }
    .ps-grid { padding: 12px; gap: 12px; }
    .ps-slide-body { min-height: 260px; }
    .ps-hsil { left: 14%; max-width: 180px; }
    .ps-ov-report { left: 52%; width: 210px; }
    .ps-foot { align-items: flex-start; gap: 10px; padding: 12px 14px; flex-direction: column; }
    .ps-controls { margin-top: 18px; gap: 10px; }
    .ps-ctrl-meta { order: -1; flex: 1 0 100%; }
    .ps-flow { width: 100%; grid-template-columns: 1fr; gap: 20px; margin-top: 36px; }
    .ps-flow-node { display: grid; grid-template-columns: 76px minmax(0,1fr); align-items: center; column-gap: 14px; text-align: left; }
    .ps-flow-circle-wrap { justify-content: flex-start; grid-row: span 2; }
    .ps-flow-label { margin-top: 0; font-size: 16px; }
    .ps-flow-sub { margin: 5px 0 0; max-width: none; font-size: 13.5px; }
    .ps-modules,
    .ps-audiences,
    .ps-proof,
    .ps-kpis { width: 100%; }
    .ps-module-card { grid-template-columns: 1fr; padding: 22px; }
    .ps-module-icon { width: 58px; height: 58px; }
    .ps-module-name { font-size: 22px; }
    .ps-audience-list { width: 100%; }
    .ps-audience-chip { flex: 1 1 calc(50% - 8px); justify-content: center; }
    .ps-kpi-group { grid-template-columns: 1fr; gap: 14px; }
    .ps-kpi { padding: 0; }
    .ps-certs { grid-template-columns: 1fr; }
  }
`;
