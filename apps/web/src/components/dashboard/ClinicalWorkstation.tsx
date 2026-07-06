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

  // Zero-orange: Medium uses a brand-neutral slate (no amber).
  const priorityColor = {
    Critical: 'bg-black text-white',
    High: 'bg-red-500 text-white',
    Medium: 'bg-slate-200 text-slate-700',
    Low: 'bg-emerald-100 text-emerald-800',
  }[currentCase.priority];

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
          <div className="w-px h-4 bg-white/10" />
          {/* Case breadcrumb */}
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-[13px]">{currentCase.id}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priorityColor}`}>
              {currentCase.priority} Priority
            </span>
            <span className="text-white/50 text-[12px]">·</span>
            <span className="text-white/80 text-[12px]">{currentCase.patientName}</span>
            <span className="text-white/40 text-[11px]">· {currentCase.patientAge}{currentCase.patientGender}</span>
            <span className="text-white/50 text-[12px]">·</span>
            <span className="text-white/60 text-[12px]">{currentCase.specimenType}</span>
          </div>
        </div>

        {/* Center — Keyboard shortcuts bar */}
        <div className="flex items-center gap-4">
          {[
            { key: 'Esc', label: 'Exit Focus' },
            { key: '← →', label: 'Next / Prev Case' },
            { key: 'R', label: 'Begin Review' },
            { key: '?', label: 'Shortcuts' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded font-mono border border-white/10">
                {key}
              </kbd>
              <span className="text-white/40 text-[11px]">{label}</span>
            </div>
          ))}
        </div>

        {/* Right — User + actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {}}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg transition-colors"
          >
            <GitBranch size={12} className="text-white/50" />
            <span className="text-white/60 text-[11px]">Compare Timeline</span>
          </button>
          <button
            onClick={close}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg transition-colors"
          >
            <X size={12} className="text-white/50" />
            <span className="text-white/60 text-[11px]">Exit Focus Mode</span>
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
            <div className="flex flex-col items-center px-5">
              <div className={`w-2.5 h-2.5 rounded-full mb-1 ${
                step.state === 'done' ? 'bg-emerald-500' :
                step.state === 'active' ? 'bg-indigo-500 animate-pulse ring-4 ring-indigo-500/20' :
                'bg-white/15'
              }`} />
              <span className={`text-[11px] font-semibold ${
                step.state === 'done' ? 'text-emerald-400' :
                step.state === 'active' ? 'text-indigo-400' :
                'text-white/30'
              }`}>{step.label}</span>
              <span className={`text-[10px] ${
                step.state === 'active' ? 'text-indigo-400 font-bold' : 'text-white/20'
              }`}>{step.time}</span>
            </div>
            {i < workflowSteps.length - 1 && (
              <div className={`w-12 h-px ${
                step.state === 'done' ? 'bg-emerald-500/40' : 'bg-white/8'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* ── MAIN THREE COLUMNS ── */}
      <div
        className="flex flex-1 min-h-0 gap-0"
        style={{
          opacity: isAnimating ? 1 : 0,
          transform: isAnimating ? 'translateY(0)' : 'translateY(12px)',
          transition: 'all 0.35s ease 0.15s',
        }}
      >
        {/* Left — Specimen Queue */}
        <div
          className="flex flex-col border-r border-white/8"
          style={{ width: '280px', flexShrink: 0, background: 'rgba(10,11,20,0.95)' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
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
          <div className="flex-1 overflow-auto">
            {specimenQueue}
          </div>
        </div>

        {/* Center — AI Model */}
        <div
          className="flex flex-col flex-1 min-w-0"
          style={{ background: 'rgba(8,9,18,0.98)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
              AI Cytology Model
            </span>
            <div className="flex items-center gap-2 text-[11px] text-white/30">
              <span>Accession: {currentCase.accessionNumber}</span>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            {aiModel}
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
          style={{ width: '320px', flexShrink: 0, background: 'rgba(10,11,20,0.95)' }}
        >
          <div className="px-4 py-2.5 border-b border-white/8">
            <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
              AI Findings
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {aiFindings}
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
                <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                  {label}
                </div>
                {sub && <div className="text-[10px] text-white/20">{sub}</div>}
              </div>
              <div className="text-[22px] font-bold text-white">{value}</div>
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
