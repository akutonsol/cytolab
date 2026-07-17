'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, ChevronLeft, ChevronRight, Check, X, RotateCcw,
  FlaskConical, ScanLine, BrainCircuit, ScanSearch, UserCheck, FileText,
  PenLine, Send, ShieldCheck, Clock, Layers, Cpu, ArrowRight, ChevronsRight,
} from 'lucide-react';
import { CASES, STAGES, severityColor, type DemoCase } from './demo-cases';
import { SlideViewer } from './SlideViewer';

const STAGE_ICON = [FlaskConical, ScanLine, BrainCircuit, ScanSearch, UserCheck, FileText, PenLine, Send];
const GUIDED_MS = 3900;

// Ease a number to a target once `active` (client-only; component is ssr:false).
function useCountUp(target: number, active: boolean, dur = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) { setV(0); return; }
    let raf = 0; let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / dur);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, dur]);
  return v;
}

export default function InteractiveExperience() {
  const [caseIdx, setCaseIdx] = useState(0);
  const c = CASES[caseIdx];
  const [stage, setStage] = useState(0);
  const [guided, setGuided] = useState(false);
  const [annotated, setAnnotated] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [concur, setConcur] = useState(true);
  const [exportState, setExportState] = useState<'idle' | 'sending' | 'done'>('idle');

  const S = (id: string) => STAGES.findIndex((s) => s.id === id);
  const reached = (id: string) => stage >= S(id);
  const stageId = STAGES[stage].id;

  const pause = () => setGuided(false);
  const goStage = (i: number, manual = true) => {
    if (manual) pause();
    setSelected(null);
    setStage(Math.max(0, Math.min(STAGES.length - 1, i)));
  };
  const pickCase = (i: number) => { pause(); setSelected(null); setExportState('idle'); setCaseIdx(i); };
  const startGuided = () => { setSelected(null); setExportState('idle'); setStage(0); setGuided(true); };

  // Guided autoplay.
  useEffect(() => {
    if (!guided) return;
    if (stage >= STAGES.length - 1) { setGuided(false); return; }
    const t = setTimeout(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), GUIDED_MS);
    return () => clearTimeout(t);
  }, [guided, stage]);

  // Auto-run the LIS export when the delivered stage is reached via guided.
  useEffect(() => {
    if (stageId === 'delivered' && guided && exportState === 'idle') {
      setExportState('sending');
      const t = setTimeout(() => setExportState('done'), 1100);
      return () => clearTimeout(t);
    }
  }, [stageId, guided, exportState]);

  const conf = useCountUp(c.aiConfidence, reached('analyzing'));
  const cells = useCountUp(c.cellsAnalyzed, reached('analyzing'), 1600);

  const slideVisible = reached('scanned');
  const heatVisible = reached('analyzing');
  const boxesVisible = reached('detected');

  const finished = stageId === 'delivered';

  return (
    <div className="xp">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── TOP BAR ── */}
      <header className="xp-top">
        <div className="xp-brand">
          <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => { const a = (i / 8) * Math.PI * 2; return <circle key={i} cx={16 + 9 * Math.cos(a)} cy={16 + 9 * Math.sin(a)} r={2.4} fill="#E63946" />; })}
            <circle cx="16" cy="16" r="2.8" fill="#E63946" />
          </svg>
          <span className="xp-brand-n">CYTOLAB</span>
          <span className="xp-brand-tag">Concept demo · no image analysis</span>
        </div>

        <div className="xp-cases">
          {CASES.map((cc, i) => (
            <button key={cc.id} className={`xp-case ${i === caseIdx ? 'on' : ''}`} onClick={() => pickCase(i)} style={i === caseIdx ? { borderColor: cc.accent, color: '#fff' } : undefined}>
              <span className="xp-case-dot" style={{ background: cc.accent }} />{cc.finding}
            </button>
          ))}
        </div>

        <div className="xp-top-r">
          <button className="xp-guide" onClick={guided ? pause : startGuided}>
            {guided ? <><Pause size={15} /> Pause</> : finished ? <><RotateCcw size={15} /> Replay</> : <><Play size={15} fill="#fff" /> Start Guided Demo</>}
          </button>
          <Link href="/" className="xp-exit" aria-label="Exit to site"><X size={18} /></Link>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="xp-body">
        {/* Left: stage rail */}
        <nav className="xp-rail">
          {STAGES.map((s, i) => {
            const Icon = STAGE_ICON[i];
            const st = i < stage ? 'done' : i === stage ? 'active' : 'pending';
            return (
              <button key={s.id} className={`xp-step ${st}`} onClick={() => goStage(i)}>
                {i < STAGES.length - 1 && <span className="xp-step-line" />}
                <span className="xp-step-ic">{i < stage ? <Check size={14} strokeWidth={3} /> : <Icon size={15} />}</span>
                <span className="xp-step-tx"><b>Step {s.n}</b>{s.short}</span>
              </button>
            );
          })}
        </nav>

        {/* Center: annotated toggle + viewer */}
        <div className="xp-center">
          <div className="xp-center-head">
            <div className="xp-title-wrap">
              <motion.h2 key={stageId} className="xp-title" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>{STAGES[stage].title}</motion.h2>
              <span className="xp-title-n">Stage {STAGES[stage].n} of 8</span>
            </div>
            <div className="xp-seg" role="group" aria-label="Overlay">
              <button className={!annotated ? 'on' : ''} onClick={() => { pause(); setAnnotated(false); }} disabled={!slideVisible}>Original</button>
              <button className={annotated ? 'on' : ''} onClick={() => { pause(); setAnnotated(true); }} disabled={!slideVisible}><Layers size={12} /> AI Annotated</button>
            </div>
          </div>
          <div className="xp-viewer">
            <SlideViewer c={c} slideVisible={slideVisible} scanning={stageId === 'scanned'} heatVisible={heatVisible} boxesVisible={boxesVisible}
              annotated={annotated} selected={selected} onSelect={setSelected} onManual={pause} />
          </div>
        </div>

        {/* Right: contextual panel */}
        <aside className="xp-panel">
          <AnimatePresence mode="wait">
            <motion.div key={stageId} className="xp-panel-in" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.32 }}>
              <RightPanel c={c} stageId={stageId} conf={conf} cells={cells} concur={concur} setConcur={(v) => { pause(); setConcur(v); }}
                exportState={exportState} runExport={() => { pause(); setExportState('sending'); setTimeout(() => setExportState('done'), 1100); }}
                selected={selected} onSelect={(id) => { pause(); setSelected(id); }} />
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>

      {/* ── BOTTOM: timeline + caption ── */}
      <footer className="xp-foot">
        <div className="xp-foot-ctrls">
          <button className="xp-fbtn" onClick={() => goStage(stage - 1)} disabled={stage === 0} aria-label="Previous"><ChevronLeft size={18} /></button>
          <button className="xp-fbtn xp-fbtn-play" onClick={guided ? pause : (finished ? startGuided : () => setGuided(true))} aria-label={guided ? 'Pause' : 'Play'}>
            {guided ? <Pause size={17} fill="#fff" /> : finished ? <RotateCcw size={16} /> : <Play size={17} fill="#fff" />}
          </button>
          <button className="xp-fbtn" onClick={() => goStage(stage + 1)} disabled={stage === STAGES.length - 1} aria-label="Next"><ChevronRight size={18} /></button>
        </div>
        <div className="xp-timeline">
          {STAGES.map((s, i) => (
            <button key={s.id} className={`xp-seg-cell ${i <= stage ? 'on' : ''} ${i === stage ? 'cur' : ''}`} onClick={() => goStage(i)} aria-label={s.title} />
          ))}
        </div>
        <div className="xp-caption">
          <AnimatePresence mode="wait">
            <motion.span key={stageId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
              <ChevronsRight size={14} className="xp-cap-ic" /> {STAGES[stage].caption}
            </motion.span>
          </AnimatePresence>
        </div>
      </footer>
    </div>
  );
}

// ── Right contextual panel — morphs per stage ───────────────────────────────
function RightPanel({ c, stageId, conf, cells, concur, setConcur, exportState, runExport, selected, onSelect }: {
  c: DemoCase; stageId: string; conf: number; cells: number; concur: boolean; setConcur: (v: boolean) => void;
  exportState: 'idle' | 'sending' | 'done'; runExport: () => void; selected: string | null; onSelect: (id: string | null) => void;
}) {
  if (stageId === 'received') return (
    <>
      <PanelHead icon={<FlaskConical size={16} />} title="Specimen accessioned" tint={c.accent} />
      <Meta k="Accession" v={c.accession} mono />
      <Meta k="Patient" v={c.patientLabel} />
      <Meta k="Age / Sex" v={`${c.age} · ${c.sex}`} />
      <Meta k="Specimen" v={c.specimenType} />
      <Meta k="Priority" v={c.priority} pill={c.priority !== 'Routine' ? c.accent : undefined} />
      <Meta k="Collected" v={c.collectedAt} />
      <Meta k="Received" v={c.receivedAt} />
      <div className="xp-barcode"><div className="xp-barcode-lines">{Array.from({ length: 42 }).map((_, i) => <span key={i} style={{ width: (i % 4 ? 1 : 2) + (i % 3), opacity: i % 5 ? 1 : .5 }} />)}</div><span className="xp-barcode-t">{c.accession}</span></div>
    </>
  );

  if (stageId === 'scanned') return (
    <>
      <PanelHead icon={<ScanLine size={16} />} title="Whole-slide image captured" tint="#8b5cf6" />
      <Meta k="Scanner" v="Aperio GT 450 · Scanner-02" />
      <Meta k="Magnification" v="40× · 0.25 µm/px" />
      <Meta k="Focus" v="Passed · 100% tiles" />
      <div className="xp-donebar"><Check size={14} strokeWidth={3} /> Digitized for review</div>
      <p className="xp-note">The physical slide is now a navigable whole-slide image. Pan and zoom the viewer to explore any region at full resolution.</p>
    </>
  );

  if (stageId === 'analyzing') return (
    <>
      <PanelHead icon={<Cpu size={16} />} title="Concept demonstration" tint="#8b5cf6" />
      <div className="xp-metric"><span>Walkthrough</span><b style={{ color: c.accent }}>{Math.round(conf)}%</b></div>
      <div className="xp-prog"><span style={{ width: `${conf}%`, background: c.accent }} /></div>
      <p className="xp-note">This is a concept demonstration — PathOS performs no slide-image analysis. The illustration shows how findings would be surfaced for a pathologist to review.</p>
    </>
  );

  if (stageId === 'detected') return (
    <>
      <PanelHead icon={<ScanSearch size={16} />} title="Findings" tint={c.accent} />
      <div className="xp-finding" style={{ borderColor: `${c.accent}55`, background: `${c.accent}12` }}>
        <div className="xp-finding-t" style={{ color: c.accent }}>{c.finding}</div>
        <div className="xp-finding-s">{c.findingLabel}</div>
      </div>
      <div className="xp-detlist">
        {c.detections.map((d) => {
          const col = severityColor[d.severity]; const on = selected === d.id;
          return (
            <button key={d.id} className={`xp-detrow ${on ? 'on' : ''}`} onClick={() => onSelect(on ? null : d.id)} style={on ? { borderColor: col } : undefined}>
              <span className="xp-detrow-dot" style={{ background: col }} />
              <span className="xp-detrow-l">{d.label}</span>
              <span className="xp-detrow-c" style={{ color: col }}>{d.confidence.toFixed(1)}%</span>
            </button>
          );
        })}
      </div>
      <p className="xp-note">Click any finding to highlight it on the slide. Toggle <b>Original / AI Annotated</b> to compare.</p>
    </>
  );

  if (stageId === 'review') return (
    <>
      <PanelHead icon={<UserCheck size={16} />} title="Pathologist review" tint={c.accent} />
      <div className="xp-md"><span className="xp-md-av" style={{ background: c.autoSigned ? '#10B981' : 'linear-gradient(150deg,#8b5cf6,#6d28d9)' }}>{c.pathologist.initials}</span>
        <div><b>{c.pathologist.name}</b><span>{c.autoSigned ? 'Workflow automation' : 'Cytopathology'}</span></div></div>
      <div className="xp-airec"><span>Suggested category (demo)</span><b style={{ color: c.accent }}>{c.finding}</b></div>
      {c.autoSigned ? (
        <div className="xp-rule"><ShieldCheck size={15} /> Every result is authorized by a pathologist — nothing is auto-signed.</div>
      ) : (
        <button className={`xp-concur ${concur ? 'on' : ''}`} onClick={() => setConcur(!concur)}>
          <span className="xp-concur-box">{concur && <Check size={13} strokeWidth={3} />}</span>
          Concur and continue
        </button>
      )}
      <p className="xp-note">{c.autoSigned ? 'A pathologist authorizes every result — the human is always in control.' : 'The pathologist confirms or overrides every finding. The human is always in control.'}</p>
    </>
  );

  if (stageId === 'draft') return (
    <>
      <PanelHead icon={<FileText size={16} />} title="Draft report" tint="#8b5cf6" />
      <div className="xp-report">
        {c.report.map((r, i) => (
          <motion.div key={r.label} className="xp-rline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.28 }}>
            <span className="xp-rline-k">{r.label}</span><span className="xp-rline-v">{r.value}</span>
          </motion.div>
        ))}
        <motion.div className="xp-rline xp-rec" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: c.report.length * 0.28 }}>
          <span className="xp-rline-k">Recommendation</span><span className="xp-rline-v">{c.recommendation}</span>
        </motion.div>
      </div>
      <p className="xp-note">A structured, Bethesda-compliant report is drafted automatically from the confirmed findings.</p>
    </>
  );

  if (stageId === 'signed') return (
    <>
      <PanelHead icon={<PenLine size={16} />} title={c.autoSigned ? 'Auto-signed' : 'Signed out'} tint="#10B981" />
      {c.autoSigned ? (
        <div className="xp-rule"><ShieldCheck size={15} /> Auto-signed by workflow rule R-07 at 08:42.</div>
      ) : (
        <div className="xp-sign">
          <svg viewBox="0 0 200 60" className="xp-sign-svg">
            <motion.path d="M8 42 C 26 12, 40 12, 46 34 S 66 52, 78 30 C 86 16, 96 44, 108 34 C 120 24, 132 46, 150 24 C 162 10, 176 30, 192 20"
              fill="none" stroke="#0a0b1a" strokeWidth="2.4" strokeLinecap="round"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: 'easeInOut' }} />
          </svg>
          <div className="xp-sign-n">{c.pathologist.name}</div>
        </div>
      )}
      <div className="xp-md" style={{ marginTop: 14 }}><span className="xp-md-av" style={{ background: '#10B981' }}><Check size={16} strokeWidth={3} /></span>
        <div><b>Report finalized</b><span>{c.bethesda}</span></div></div>
      <Meta k="Turnaround" v={`${c.tatHours.toFixed(1)} hrs`} pill="#10B981" />
    </>
  );

  // delivered
  return (
    <>
      <PanelHead icon={<Send size={16} />} title="Report delivered" tint="#10B981" />
      <div className="xp-delivered"><span className="xp-delivered-c"><Check size={26} color="#10B981" strokeWidth={3} /></span>
        <b>Signed &amp; delivered</b><span>{c.accession} · {c.finding}</span></div>

      <button className={`xp-export ${exportState}`} onClick={exportState === 'idle' ? runExport : undefined} disabled={exportState !== 'idle'}>
        {exportState === 'idle' && <><Send size={15} /> Export to LIS</>}
        {exportState === 'sending' && <><span className="xp-spin" /> Transmitting HL7…</>}
        {exportState === 'done' && <><Check size={15} strokeWidth={3} /> Delivered to LIS (ORU^R01)</>}
      </button>

      <div className="xp-audit-h"><ShieldCheck size={13} /> Audit trail</div>
      <div className="xp-audit">
        {c.audit.map((a, i) => (
          <motion.div key={i} className="xp-arow" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, delay: i * 0.06 }}>
            <span className="xp-arow-t">{a.t}</span>
            <span className="xp-arow-b"><b>{a.actor}</b>{a.action}</span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function PanelHead({ icon, title, tint, live }: { icon: React.ReactNode; title: string; tint: string; live?: boolean }) {
  return (
    <div className="xp-ph">
      <span className="xp-ph-ic" style={{ background: `${tint}1c`, border: `1px solid ${tint}44`, color: tint }}>{icon}</span>
      <span className="xp-ph-t">{title}</span>
      {live && <span className="xp-ph-live"><span /> LIVE</span>}
    </div>
  );
}

function Meta({ k, v, mono, pill }: { k: string; v: string; mono?: boolean; pill?: string }) {
  return (
    <div className="xp-meta">
      <span className="xp-meta-k">{k}</span>
      {pill ? <span className="xp-meta-pill" style={{ background: `${pill}20`, color: pill, border: `1px solid ${pill}55` }}>{v}</span>
        : <span className="xp-meta-v" style={mono ? { fontFamily: 'ui-monospace, monospace' } : undefined}>{v}</span>}
    </div>
  );
}

const CSS = `
  .xp { position: fixed; inset: 0; display: flex; flex-direction: column; background: radial-gradient(1200px 700px at 50% -10%, #17122e, #0b0a16 60%); color: #fff; font-family: var(--font-inter), Inter, system-ui, sans-serif; overflow: hidden; }

  .xp-top { display: flex; align-items: center; gap: 20px; padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,.08); flex-shrink: 0; }
  .xp-brand { display: flex; align-items: center; gap: 9px; }
  .xp-brand-n { font-size: 16px; font-weight: 800; letter-spacing: .02em; }
  .xp-brand-tag { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.45); border-left: 1px solid rgba(255,255,255,.16); padding-left: 10px; margin-left: 2px; }
  .xp-cases { display: flex; gap: 8px; margin: 0 auto; }
  .xp-case { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,.6); background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 7px 14px; cursor: pointer; transition: all .18s ease; }
  .xp-case:hover { color: #fff; background: rgba(255,255,255,.08); }
  .xp-case.on { background: rgba(255,255,255,.08); }
  .xp-case-dot { width: 8px; height: 8px; border-radius: 50%; }
  .xp-top-r { display: flex; align-items: center; gap: 12px; }
  .xp-guide { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: #fff; background: #E63946; border: none; border-radius: 10px; padding: 10px 18px; cursor: pointer; box-shadow: 0 8px 22px -8px rgba(230,57,70,.7); transition: transform .15s ease; }
  .xp-guide:hover { transform: translateY(-1px); }
  .xp-exit { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 10px; color: rgba(255,255,255,.6); background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); }
  .xp-exit:hover { color: #fff; background: rgba(255,255,255,.1); }

  .xp-body { flex: 1; display: grid; grid-template-columns: 210px minmax(0,1fr) 360px; gap: 16px; padding: 16px 22px; min-height: 0; }

  /* Stage rail */
  .xp-rail { display: flex; flex-direction: column; gap: 2px; }
  .xp-step { position: relative; display: flex; align-items: center; gap: 12px; padding: 9px 8px; background: none; border: none; cursor: pointer; text-align: left; border-radius: 10px; transition: background .15s ease; }
  .xp-step:hover { background: rgba(255,255,255,.04); }
  .xp-step-line { position: absolute; left: 24px; top: 34px; bottom: -2px; width: 2px; background: rgba(255,255,255,.09); }
  .xp-step.done .xp-step-line { background: rgba(16,185,129,.4); }
  .xp-step-ic { position: relative; z-index: 1; width: 33px; height: 33px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; color: rgba(255,255,255,.5); background: rgba(255,255,255,.06); border: 1.5px solid rgba(255,255,255,.14); transition: all .2s ease; }
  .xp-step.done .xp-step-ic { background: #10B981; border-color: #10B981; color: #fff; }
  .xp-step.active .xp-step-ic { background: #E63946; border-color: #E63946; color: #fff; box-shadow: 0 0 0 4px rgba(230,57,70,.18); }
  .xp-step-tx { display: flex; flex-direction: column; font-size: 13px; font-weight: 600; color: rgba(255,255,255,.55); line-height: 1.25; }
  .xp-step-tx b { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.35); }
  .xp-step.active .xp-step-tx { color: #fff; }
  .xp-step.done .xp-step-tx { color: rgba(255,255,255,.7); }

  /* Center */
  .xp-center { display: flex; flex-direction: column; min-height: 0; }
  .xp-center-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; }
  .xp-title { font-size: 24px; font-weight: 800; letter-spacing: -.02em; margin: 0; }
  .xp-title-n { font-size: 12px; color: rgba(255,255,255,.45); }
  .xp-title-wrap { display: flex; align-items: baseline; gap: 12px; }
  .xp-seg { display: inline-flex; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 3px; }
  .xp-seg button { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: rgba(255,255,255,.55); background: none; border: none; border-radius: 7px; padding: 7px 13px; cursor: pointer; transition: all .15s ease; }
  .xp-seg button.on { background: rgba(255,255,255,.12); color: #fff; }
  .xp-seg button:disabled { opacity: .4; cursor: default; }
  .xp-viewer { flex: 1; min-height: 0; }

  /* Right panel */
  .xp-panel { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 18px; overflow: hidden; display: flex; }
  .xp-panel-in { width: 100%; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
  .xp-ph { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .xp-ph-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; }
  .xp-ph-t { font-size: 15px; font-weight: 800; }
  .xp-ph-live { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; color: #10B981; }
  .xp-ph-live span { width: 6px; height: 6px; border-radius: 50%; background: #10B981; animation: xp-blink 1.4s infinite; }
  @keyframes xp-blink { 0%,100%{opacity:1} 50%{opacity:.3} }

  .xp-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .xp-meta-k { font-size: 12px; color: rgba(255,255,255,.45); }
  .xp-meta-v { font-size: 12.5px; font-weight: 600; color: #fff; text-align: right; }
  .xp-meta-pill { font-size: 11px; font-weight: 700; border-radius: 999px; padding: 3px 10px; }

  .xp-barcode { margin-top: 16px; background: #fff; border-radius: 8px; padding: 12px; }
  .xp-barcode-lines { display: flex; align-items: flex-end; gap: 1.5px; height: 42px; }
  .xp-barcode-lines span { display: block; height: 100%; background: #0a0b1a; }
  .xp-barcode-t { display: block; text-align: center; font-family: ui-monospace, monospace; font-size: 11px; color: #0a0b1a; margin-top: 6px; letter-spacing: .1em; }

  .xp-donebar { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #10B981; background: rgba(16,185,129,.12); border: 1px solid rgba(16,185,129,.3); border-radius: 10px; padding: 10px 14px; margin: 8px 0; }
  .xp-note { font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,.5); margin-top: 14px; }
  .xp-note b { color: rgba(255,255,255,.8); }

  .xp-metric { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; font-size: 12.5px; color: rgba(255,255,255,.6); }
  .xp-metric b { font-size: 20px; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
  .xp-prog { height: 6px; border-radius: 999px; background: rgba(255,255,255,.08); overflow: hidden; margin-top: 6px; }
  .xp-prog span { display: block; height: 100%; border-radius: 999px; transition: width .2s ease; }

  .xp-finding { border: 1px solid; border-radius: 12px; padding: 14px; margin-bottom: 14px; }
  .xp-finding-t { font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
  .xp-finding-s { font-size: 12px; color: rgba(255,255,255,.6); margin-top: 2px; }
  .xp-detlist { display: flex; flex-direction: column; gap: 6px; }
  .xp-detrow { display: flex; align-items: center; gap: 10px; padding: 9px 11px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 9px; cursor: pointer; transition: all .15s ease; }
  .xp-detrow:hover { background: rgba(255,255,255,.07); }
  .xp-detrow.on { background: rgba(255,255,255,.08); }
  .xp-detrow-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .xp-detrow-l { font-size: 13px; font-weight: 600; color: #fff; }
  .xp-detrow-c { margin-left: auto; font-size: 12.5px; font-weight: 700; font-variant-numeric: tabular-nums; }

  .xp-md { display: flex; align-items: center; gap: 11px; }
  .xp-md-av { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; color: #fff; flex-shrink: 0; }
  .xp-md b { display: block; font-size: 13.5px; } .xp-md span { font-size: 11.5px; color: rgba(255,255,255,.5); }
  .xp-airec { display: flex; align-items: center; justify-content: space-between; margin: 14px 0; padding: 12px 14px; background: rgba(255,255,255,.04); border-radius: 10px; font-size: 12.5px; color: rgba(255,255,255,.6); }
  .xp-airec b { font-size: 16px; font-weight: 800; }
  .xp-concur { display: flex; align-items: center; gap: 10px; width: 100%; font-size: 13px; font-weight: 600; color: #fff; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 12px 14px; cursor: pointer; }
  .xp-concur.on { border-color: rgba(16,185,129,.5); background: rgba(16,185,129,.1); }
  .xp-concur-box { width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid rgba(255,255,255,.3); display: grid; place-items: center; color: #fff; }
  .xp-concur.on .xp-concur-box { background: #10B981; border-color: #10B981; }
  .xp-rule { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; line-height: 1.5; color: #6ee7b7; background: rgba(16,185,129,.1); border: 1px solid rgba(16,185,129,.28); border-radius: 10px; padding: 12px 14px; }

  .xp-report { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 6px 14px; }
  .xp-rline { padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
  .xp-rline:last-child { border-bottom: none; }
  .xp-rline-k { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.4); margin-bottom: 3px; }
  .xp-rline-v { font-size: 13px; color: #fff; line-height: 1.45; }
  .xp-rec .xp-rline-v { color: #c4b5fd; }

  .xp-sign { background: #fff; border-radius: 12px; padding: 10px 14px 8px; }
  .xp-sign-svg { width: 100%; height: 52px; }
  .xp-sign-n { font-size: 11px; color: #64748b; border-top: 1px solid #e5e7eb; padding-top: 5px; text-align: center; }

  .xp-delivered { text-align: center; padding: 8px 0 14px; display: grid; justify-items: center; gap: 5px; }
  .xp-delivered-c { width: 60px; height: 60px; border-radius: 50%; background: rgba(16,185,129,.14); border: 1px solid rgba(16,185,129,.4); display: grid; place-items: center; margin-bottom: 4px; }
  .xp-delivered b { font-size: 16px; } .xp-delivered span { font-size: 12px; color: rgba(255,255,255,.5); }
  .xp-export { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; font-size: 13px; font-weight: 700; color: #fff; background: #E63946; border: none; border-radius: 10px; padding: 12px; cursor: pointer; transition: all .18s ease; }
  .xp-export.sending { background: rgba(255,255,255,.1); }
  .xp-export.done { background: rgba(16,185,129,.16); color: #6ee7b7; border: 1px solid rgba(16,185,129,.4); cursor: default; }
  .xp-spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; animation: xp-spin 0.8s linear infinite; }
  @keyframes xp-spin { to { transform: rotate(360deg); } }

  .xp-audit-h { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: rgba(255,255,255,.4); margin: 18px 0 10px; }
  .xp-audit { display: flex; flex-direction: column; gap: 2px; }
  .xp-arow { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
  .xp-arow-t { font-family: ui-monospace, monospace; font-size: 11px; color: rgba(255,255,255,.4); flex-shrink: 0; padding-top: 1px; }
  .xp-arow-b { font-size: 12px; color: rgba(255,255,255,.65); line-height: 1.4; } .xp-arow-b b { display: block; color: #fff; font-weight: 700; font-size: 12px; }

  /* Footer timeline */
  .xp-foot { display: flex; align-items: center; gap: 18px; padding: 14px 22px; border-top: 1px solid rgba(255,255,255,.08); flex-shrink: 0; }
  .xp-foot-ctrls { display: flex; align-items: center; gap: 8px; }
  .xp-fbtn { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); cursor: pointer; transition: all .15s ease; }
  .xp-fbtn:hover:not(:disabled) { background: rgba(255,255,255,.12); }
  .xp-fbtn:disabled { opacity: .35; cursor: default; }
  .xp-fbtn-play { width: 44px; height: 44px; background: #E63946; border-color: transparent; box-shadow: 0 8px 20px -8px rgba(230,57,70,.7); }
  .xp-timeline { display: flex; gap: 5px; flex: 0 0 auto; }
  .xp-seg-cell { width: 34px; height: 6px; border-radius: 999px; background: rgba(255,255,255,.12); border: none; cursor: pointer; transition: all .2s ease; padding: 0; }
  .xp-seg-cell.on { background: #8b5cf6; }
  .xp-seg-cell.cur { background: #E63946; width: 46px; }
  .xp-caption { flex: 1; font-size: 13.5px; color: rgba(255,255,255,.7); line-height: 1.5; }
  .xp-cap-ic { color: #E63946; vertical-align: -2px; margin-right: 4px; }

  @media (max-width: 1100px) {
    .xp-body { grid-template-columns: 1fr; grid-auto-rows: min-content; overflow-y: auto; }
    .xp-rail { flex-direction: row; overflow-x: auto; } .xp-step-line { display: none; }
    .xp-viewer { height: 420px; }
    .xp-foot { flex-wrap: wrap; } .xp-caption { order: 3; flex-basis: 100%; }
  }
`;
