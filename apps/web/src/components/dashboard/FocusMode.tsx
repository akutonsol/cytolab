'use client';
import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2 } from 'lucide-react';

interface FocusModeProps {
  specimenQueue: React.ReactNode;
  aiModel: React.ReactNode;
  aiFindings: React.ReactNode;
  kpiStats: {
    label: string;
    value: string;
    sub?: string;
  }[];
}

export function FocusMode({ specimenQueue, aiModel, aiFindings, kpiStats }: FocusModeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => setIsAnimating(true));
  }, []);

  const close = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => setIsOpen(false), 350);
  }, []);

  // Escape closes; `F` toggles open (unless typing in a field).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (isOpen) close(); return; }
      if (e.key === 'f' || e.key === 'F') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (!isOpen) open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, open, close]);

  // Prevent body scroll when open.
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Trigger button — sits in the hero section. */}
      <button
        onClick={open}
        className="group absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50"
        title="Enter Focus Mode (F)"
        aria-label="Enter focus mode"
      >
        <Maximize2 size={14} className="text-gray-400 transition-colors group-hover:text-indigo-600" />
      </button>

      {/* Portal overlay */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col"
          style={{
            background: isAnimating ? 'rgba(8, 10, 20, 0.92)' : 'rgba(8, 10, 20, 0)',
            backdropFilter: isAnimating ? 'blur(8px)' : 'blur(0px)',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div className="absolute inset-0" onClick={close} />

          <div
            className="relative z-10 flex h-full flex-col"
            style={{
              maxWidth: '1680px',
              margin: '0 auto',
              padding: '24px 48px',
              width: '100%',
              opacity: isAnimating ? 1 : 0,
              transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(16px)',
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                <span className="text-[15px] font-semibold text-white">AI Diagnostic Workspace</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/70">Focus Mode</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/30">Press Esc to exit</span>
                <button
                  onClick={close}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/10 transition-colors hover:bg-white/20"
                  aria-label="Exit focus mode"
                >
                  <X size={15} className="text-white" />
                </button>
              </div>
            </div>

            {/* Three-column layout — staggered entrance. */}
            <div className="grid flex-1 gap-4" style={{ gridTemplateColumns: '1fr 2fr 1fr', minHeight: 0 }}>
              <div className="focus-panel-enter flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm" style={{ animationDelay: '0ms' }}>
                <div className="border-b border-white/10 px-5 py-4">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Specimen Queue</span>
                </div>
                <div className="flex-1 overflow-auto p-3">{specimenQueue}</div>
              </div>

              <div className="focus-panel-enter flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm" style={{ animationDelay: '50ms' }}>
                <div className="border-b border-white/10 px-5 py-4">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">AI Cytology Model</span>
                </div>
                <div className="flex-1 overflow-hidden">{aiModel}</div>
              </div>

              <div className="focus-panel-enter flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm" style={{ animationDelay: '100ms' }}>
                <div className="border-b border-white/10 px-5 py-4">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">AI Findings</span>
                </div>
                <div className="flex-1 overflow-auto p-4">{aiFindings}</div>
              </div>
            </div>

            {/* KPI stats row */}
            <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${kpiStats.length}, 1fr)` }}>
              {kpiStats.map(({ label, value, sub }) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3">
                  <div>
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">{label}</div>
                    {sub && <div className="text-[11px] text-white/30">{sub}</div>}
                  </div>
                  <div className="text-[22px] font-bold text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
