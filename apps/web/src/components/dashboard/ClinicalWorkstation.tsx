'use client';
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Maximize2, ZoomIn, ZoomOut, Move, Target, MessageSquare, GitBranch } from 'lucide-react';

interface WorkstationProps {
  isOpen: boolean;
  onClose: () => void;
  currentCase: {
    id: string;
    priority: 'High' | 'Medium' | 'Low' | 'Critical';
    patientName: string;
    patientAge: number;
    patientGender: string;
    specimenType: string;
    accessionNumber: string;
  };
  specimenQueue: React.ReactNode;
  aiModel: React.ReactNode;
  aiFindings: React.ReactNode;
  kpiStats: { label: string; value: string; sub?: string }[];
  onBeginReview?: () => void;
  onNextCase?: () => void;
  onPrevCase?: () => void;
}

export function ClinicalWorkstation({
  isOpen, onClose, currentCase,
  specimenQueue, aiModel, aiFindings,
  kpiStats, onBeginReview, onNextCase, onPrevCase,
}: WorkstationProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const open = useCallback(() => {
    requestAnimationFrame(() => setIsAnimating(true));
  }, []);

  const close = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => onClose(), 300);
  }, [onClose]);

  useEffect(() => {
    if (isOpen) open();
  }, [isOpen, open]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') onNextCase?.();
      if (e.key === 'ArrowLeft') onPrevCase?.();
      if (e.key === 'r' || e.key === 'R') onBeginReview?.();
      if (e.key === '?') setShowShortcuts(s => !s);
      if (e.key === '+') setZoom(z => Math.min(z + 10, 200));
      if (e.key === '-') setZoom(z => Math.max(z - 10, 50));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close, onNextCase, onPrevCase, onBeginReview]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Zero-orange: Medium uses a brand-neutral slate (no amber). Inline styles
  // only in this component so nothing gets overridden by Tailwind resets.
  const priorityStyle = {
    Critical: { background: '#000000', color: 'white' },
    High: { background: '#ef4444', color: 'white' },
    Medium: { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' },
    Low: { background: 'rgba(16,185,129,0.2)', color: '#34d399' },
  }[currentCase.priority];

  // Workflow timeline colors — match reference exactly.
  const stepColor: Record<string, { dot: string; label: string; time: string }> = {
    done: { dot: '#10b981', label: '#34d399', time: '#10b981' },
    active: { dot: '#6366f1', label: '#818cf8', time: '#818cf8' },
    pending: { dot: 'rgba(255,255,255,0.15)', label: 'rgba(255,255,255,0.3)', time: 'rgba(255,255,255,0.2)' },
  };

  const workflowSteps = [
    { label: 'Uploaded', time: '08:35 AM', state: 'done' },
    { label: 'Scanning', time: 'LIVE', state: 'active' },
    { label: 'AI Complete', time: '08:43 AM', state: 'pending' },
    { label: 'Human Review', time: 'Pending', state: 'pending' },
    { label: 'Authorization', time: '—', state: 'pending' },
    { label: 'Released', time: '—', state: 'pending' },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        height: '100vh',
        background: isAnimating ? '#0a0b14' : 'transparent',
        transition: 'background 0.3s ease',
      }}
    >
      {/* ── TOP BAR ── */}
      <div
        className="flex items-center justify-between px-5 border-b border-white/8"
        style={{
          height: '56px',
          background: 'rgba(15,17,30,0.95)',
          backdropFilter: 'blur(12px)',
          opacity: isAnimating ? 1 : 0,
          transform: isAnimating ? 'translateY(0)' : 'translateY(-8px)',
          transition: 'all 0.3s ease 0.05s',
        }}
      >
        {/* Left — Logo + case info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-[11px] font-bold">CY</span>
            </div>
            <span className="text-white font-bold text-[13px]">CYTOLAB</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <span className="text-white/60 text-[12px] font-medium">AI Diagnostic Workspace</span>
          <div className="px-2.5 py-1 bg-indigo-600 rounded-full text-white text-[11px] font-bold">
            Focus Mode
          </div>
        </div>

        {/* Center — Keyboard shortcuts bar */}
        <div className="flex items-center gap-3">
          {[
            { key: 'Esc', label: 'Exit Focus' },
            { key: '← →', label: 'Next / Prev Case' },
            { key: 'R', label: 'Begin Review' },
            { key: '?', label: 'Shortcuts' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd style={{
                fontSize: '11px',
                background: 'rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.75)',
                padding: '2px 7px',
                borderRadius: '5px',
                fontFamily: 'monospace',
                border: '1px solid rgba(255,255,255,0.15)',
                lineHeight: '1.4',
              }}>
                {key}
              </kbd>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Right — User + actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {}}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '12px',
              cursor: 'pointer', transition: '0.2s',
            }}
          >
            <GitBranch size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
            Compare Timeline
          </button>
          <button
            onClick={close}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <X size={12} style={{ color: 'rgba(255,255,255,0.5)' }} />
            Exit Focus Mode
          </button>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
              DM
            </div>
            <div>
              <div className="text-white text-[11px] font-semibold leading-tight">Dwight McMorris</div>
              <div className="text-white/40 text-[10px]">Cytotechnologist</div>
            </div>
          </div>
        </div>
      </div>

      {/* Case breadcrumb bar */}
      <div className="flex items-center gap-8 px-5 py-2 border-b border-white/8"
        style={{ background: 'rgba(12,14,24,0.97)', height: '44px' }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Current Case</div>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{currentCase.id}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, ...priorityStyle, padding: '2px 8px', borderRadius: '4px' }}>
              {currentCase.priority} Priority
            </span>
          </div>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Patient</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            {currentCase.patientName} · <span style={{ color: 'rgba(255,255,255,0.5)' }}>{currentCase.patientAge}{currentCase.patientGender}</span>
          </div>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Specimen</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{currentCase.specimenType}</div>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Accession</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: 'monospace' }}>{currentCase.accessionNumber}</div>
        </div>
      </div>

      {/* ── WORKFLOW TIMELINE ── */}
      <div
        className="flex items-center justify-center gap-0 px-6 border-b border-white/8"
        style={{
          height: '52px',
          background: 'rgba(12,14,26,0.95)',
          opacity: isAnimating ? 1 : 0,
          transition: 'opacity 0.3s ease 0.1s',
        }}
      >
        {workflowSteps.map((step, i) => (
          <div key={step.label} className="flex items-center">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 20px' }}>
              <div style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: stepColor[step.state].dot,
                marginBottom: '4px',
                boxShadow: step.state === 'active' ? '0 0 0 4px rgba(99,102,241,0.2)' : 'none',
                animation: step.state === 'active' ? 'pulse 2s infinite' : 'none',
              }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: stepColor[step.state].label }}>
                {step.label}
              </span>
              <span style={{ fontSize: '10px', color: stepColor[step.state].time, fontWeight: step.state === 'active' ? 700 : 400 }}>
                {step.time}
              </span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div style={{
                width: '48px', height: '1px',
                background: step.state === 'done' ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.08)',
                marginTop: '-18px',
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ── MAIN THREE COLUMNS ── */}
      <div
        className="flex gap-0"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          opacity: isAnimating ? 1 : 0,
          transform: isAnimating ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 0.35s ease 0.15s',
        }}
      >
        {/* Left — Specimen Queue */}
        <div
          className="flex flex-col border-r border-white/8"
          style={{ width: '320px', flexShrink: 0, height: '100%', overflow: 'hidden', background: 'rgba(10,11,20,0.95)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Specimen Queue
            </span>
            <div className="flex items-center gap-1">
              <button onClick={onPrevCase} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <ChevronLeft size={12} className="text-white/40" />
              </button>
              <button onClick={onNextCase} className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                <ChevronRight size={12} className="text-white/40" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2" style={{ fontSize: '11px' }}>
            <div className="workstation-queue" style={{ height: '100%', overflow: 'auto' }}>
              <style>{`
                /* The queue card is an inline-styled <div> (background:#fff,
                   height:540) with no classes; target every direct div child so
                   !important beats its inline background + fixed height. */
                .workstation-queue > div {
                  height: 100% !important;
                  background: transparent !important;
                  box-shadow: none !important;
                  border: none !important;
                }
                .workstation-queue .rounded-2xl,
                .workstation-queue .rounded-xl {
                  background: transparent !important;
                  border-color: rgba(255,255,255,0.06) !important;
                  box-shadow: none !important;
                }
                .workstation-queue h2,
                .workstation-queue h3,
                .workstation-queue .font-semibold,
                .workstation-queue .font-bold {
                  color: rgba(255,255,255,0.85) !important;
                }
                .workstation-queue .text-gray-400,
                .workstation-queue .text-gray-500,
                .workstation-queue .text-gray-600 {
                  color: rgba(255,255,255,0.4) !important;
                }
                .workstation-queue select,
                .workstation-queue button:not([class*="indigo"]) {
                  background: rgba(255,255,255,0.06) !important;
                  border-color: rgba(255,255,255,0.1) !important;
                  color: rgba(255,255,255,0.7) !important;
                }
                .workstation-queue .bg-white {
                  background: rgba(255,255,255,0.03) !important;
                }
                .workstation-queue .shadow,
                .workstation-queue .shadow-sm {
                  box-shadow: none !important;
                }
                /* --- reference text colors / sizes --- */
                .workstation-queue [class*="text-gray-900"],
                .workstation-queue [class*="font-bold"]:not(button) {
                  color: rgba(255,255,255,0.88) !important;
                }
                .workstation-queue [class*="text-gray-500"],
                .workstation-queue [class*="text-gray-600"] {
                  color: rgba(255,255,255,0.4) !important;
                }
                .workstation-queue [class*="text-indigo-600"] {
                  color: #818cf8 !important;
                  font-size: 13px !important;
                  font-weight: 700 !important;
                }
                .workstation-queue [class*="AI Screening"] {
                  color: #34d399 !important;
                  font-size: 10px !important;
                }
                .workstation-queue [class*="text-indigo-500"] {
                  color: #818cf8 !important;
                  font-size: 10px !important;
                }
                /* Selected item highlight */
                .workstation-queue [class*="bg-indigo-50"] {
                  background: rgba(99,102,241,0.12) !important;
                  border-color: rgba(99,102,241,0.3) !important;
                }
              `}</style>
              {specimenQueue}
            </div>
          </div>
        </div>

        {/* Center — AI Model */}
        <div
          className="flex flex-col flex-1 min-w-0"
          style={{ flex: 1, minWidth: 0, height: '100%', overflow: 'hidden', background: 'rgba(8,9,18,0.98)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              AI Cytology Model
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <style>{`
              .workstation-model > div:first-child {
                height: 100% !important;
                min-height: 100% !important;
                border-radius: 0 !important;
                border: none !important;
                background: transparent !important;
              }
            `}</style>
            <div className="workstation-model" style={{ height: '100%' }}>
              {aiModel}
            </div>
            {/* Zoom controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2">
              <button className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
                <Move size={13} className="text-white/50" />
              </button>
              <button className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
                <Target size={13} className="text-white/50" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button onClick={() => setZoom(z => Math.max(z - 10, 50))} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
                <ZoomOut size={13} className="text-white/50" />
              </button>
              <span className="text-white/50 text-[11px] font-mono w-10 text-center">{zoom}%</span>
              <button onClick={() => setZoom(z => Math.min(z + 10, 200))} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
                <ZoomIn size={13} className="text-white/50" />
              </button>
              <div className="w-px h-4 bg-white/10" />
              <button onClick={() => setZoom(100)} className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors">
                <Maximize2 size={13} className="text-white/50" />
              </button>
            </div>
          </div>
        </div>

        {/* Right — AI Findings */}
        <div
          className="flex flex-col border-l border-white/8"
          style={{ width: '360px', flexShrink: 0, height: '100%', overflow: 'hidden', background: 'rgba(10,11,20,0.95)' }}
        >
          <div className="px-4 py-2.5 border-b border-white/8">
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              AI Findings
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            <style>{`
              /* All text in findings panel — match reference */
              .workstation-findings {
                color: rgba(255,255,255,0.85);
                font-size: 12px;
              }
              /* Section headers like "AI FINDINGS", "CYTO AI", "CONFIDENCE", "AI EVIDENCE" */
              .workstation-findings [class*="uppercase"],
              .workstation-findings [class*="tracking-wide"] {
                color: rgba(255,255,255,0.35) !important;
                font-size: 10px !important;
                letter-spacing: 0.1em !important;
              }
              /* Case ID link — bright indigo */
              .workstation-findings [class*="text-indigo-600"] {
                color: #818cf8 !important;
              }
              /* AI Screening Complete — bright green */
              .workstation-findings [class*="text-emerald"],
              .workstation-findings [class*="bg-emerald-50"] {
                background: rgba(16,185,129,0.12) !important;
                color: #34d399 !important;
              }
              /* Confidence percentage — bright */
              .workstation-findings [class*="text-indigo-600"]:not([class*="bg"]) {
                color: #818cf8 !important;
                font-size: 14px !important;
                font-weight: 700 !important;
              }
              /* "High Confidence" label */
              .workstation-findings [class*="text-emerald-600"] {
                color: #34d399 !important;
                font-size: 11px !important;
              }
              /* "Very Low Risk" text */
              .workstation-findings [class*="text-emerald-500"] {
                color: #10b981 !important;
              }
              /* FDA Validated / CAP Certified badges */
              .workstation-findings [class*="bg-indigo-50"] {
                background: rgba(99,102,241,0.2) !important;
                border-color: rgba(99,102,241,0.3) !important;
              }
              .workstation-findings [class*="text-indigo-700"] {
                color: #a5b4fc !important;
                font-size: 10px !important;
              }
              /* CYTO AI version badge */
              .workstation-findings [class*="bg-indigo-100"] {
                background: rgba(99,102,241,0.15) !important;
              }
              /* Prediction value — large white */
              .workstation-findings h3,
              .workstation-findings [class*="text-gray-900"] {
                color: rgba(255,255,255,0.92) !important;
              }
              /* Secondary text */
              .workstation-findings [class*="text-gray-500"],
              .workstation-findings [class*="text-gray-600"],
              .workstation-findings [class*="text-gray-400"] {
                color: rgba(255,255,255,0.38) !important;
              }
              /* Evidence confidence percentages */
              .workstation-findings [class*="text-gray-700"] {
                color: rgba(255,255,255,0.75) !important;
                font-size: 11px !important;
              }
              /* Evidence labels — Strong Evidence / High Evidence */
              .workstation-findings [class*="text-gray-400"]:last-child {
                color: rgba(255,255,255,0.3) !important;
                font-size: 10px !important;
              }
              /* Dividers */
              .workstation-findings [class*="bg-gray-100"],
              .workstation-findings hr,
              .workstation-findings [class*="h-px"] {
                background: rgba(255,255,255,0.06) !important;
              }
              /* Progress bars — keep their colors */
              .workstation-findings [class*="bg-indigo-600"],
              .workstation-findings [class*="bg-indigo-400"] {
                background: #6366f1 !important;
              }
              .workstation-findings [class*="bg-emerald-500"] {
                background: #10b981 !important;
              }
              .workstation-findings [class*="bg-red-500"] {
                background: #ef4444 !important;
              }
              /* zero-orange: yellow-400 caution instead of amber-500 (#f59e0b trips the detector) */
              .workstation-findings [class*="bg-amber-500"] {
                background: #facc15 !important;
              }
              /* Recommendation box */
              .workstation-findings [class*="bg-amber-50"] {
                background: rgba(180,83,9,0.15) !important;
                border-color: rgba(180,83,9,0.3) !important;
              }
              .workstation-findings [class*="text-amber-700"],
              .workstation-findings [class*="text-amber-800"],
              .workstation-findings [class*="text-amber-900"] {
                color: #fbbf24 !important;
              }
              /* Begin Review button */
              .workstation-findings button[class*="bg-indigo-600"] {
                background: #4f46e5 !important;
                color: white !important;
              }
              /* Workflow timeline dots */
              .workstation-findings [class*="bg-indigo-500"] {
                background: #6366f1 !important;
              }
              .workstation-findings [class*="bg-gray-200"] {
                background: rgba(255,255,255,0.1) !important;
              }
              /* Confidence history bars */
              .workstation-findings [class*="bg-indigo-200"] {
                background: rgba(99,102,241,0.3) !important;
              }
              /* "85,203 cases processed" muted */
              .workstation-findings p[class*="text-gray"] {
                color: rgba(255,255,255,0.3) !important;
                font-size: 11px !important;
              }
              /* --- preserved structural / no-regression rules (not text/size) --- */
              .workstation-findings .bg-white,
              .workstation-findings .bg-gray-50 { background: rgba(255,255,255,0.04) !important; }
              .workstation-findings .border-gray-100,
              .workstation-findings .border-gray-200 { border-color: rgba(255,255,255,0.08) !important; }
              /* The findings card is inline-styled (height:540, background:white,
                 overflowY:auto) with no classes — unclip it so the full content
                 flows and the column scrolls to show Review Workflow + Begin Review. */
              .workstation-findings > div {
                height: auto !important;
                min-height: 100% !important;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                overflow: visible !important;
              }
            `}</style>
            <div className="workstation-findings" style={{ padding: '12px' }}>
              {aiFindings}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM KPI BAR ── */}
      <div
        className="flex items-center border-t border-white/8"
        style={{
          height: '60px',
          background: 'rgba(10,11,22,0.97)',
          opacity: isAnimating ? 1 : 0,
          transition: 'opacity 0.3s ease 0.2s',
        }}
      >
        <div className="flex flex-1 items-center">
          {kpiStats.map(({ label, value, sub }, i) => (
            <div
              key={label}
              className={`flex items-center justify-between flex-1 px-6 ${
                i < kpiStats.length - 1 ? 'border-r border-white/8' : ''
              }`}
            >
              <div>
                <div style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {label}
                </div>
                {sub && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)' }}>{sub}</div>}
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Comments + Begin Review */}
        <div className="flex items-center gap-3 px-5 border-l border-white/8 h-full">
          <button className="relative w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 flex items-center justify-center transition-colors">
            <MessageSquare size={16} className="text-white/50" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
              2
            </div>
          </button>
          <button
            onClick={onBeginReview}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            Begin Review
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60" onClick={() => setShowShortcuts(false)}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <div className="text-white font-bold mb-4">Keyboard Shortcuts</div>
            {[
              ['Esc', 'Exit Focus Mode'],
              ['← →', 'Navigate cases'],
              ['R', 'Begin Review'],
              ['+  -', 'Zoom in / out'],
              ['?', 'Toggle shortcuts'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                <span className="text-white/60 text-sm">{label}</span>
                <kbd className="bg-white/10 text-white/70 px-2 py-0.5 rounded text-[11px] font-mono">{key}</kbd>
              </div>
            ))}
            <button onClick={() => setShowShortcuts(false)} className="mt-4 w-full py-2 bg-white/10 hover:bg-white/15 text-white text-sm rounded-xl transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
