'use client';

import { ArrowRight, Check, Compass, SkipForward, X } from 'lucide-react';
import { useGuideStore } from '@/lib/guide/store';
import { setGuideEnabled } from '@/lib/guide/sync';
import type { GuideState } from '@/lib/guide/useGuide';

/**
 * The corner "coach" panel: narrates the current step, shows progress, and
 * offers Skip / Turn off. Sits bottom-right, out of the workflow.
 */
export function CoachPanel({ guide }: { guide: GuideState }) {
  const { journey, step, stepIndex, total, completed, onRoute } = guide;
  const signal = useGuideStore((s) => s.signal);
  const dismissJourney = useGuideStore((s) => s.dismissJourney);
  const collapsed = useGuideStore((s) => s.collapsed);
  const setCollapsed = useGuideStore((s) => s.setCollapsed);
  if (!journey) return null;

  const done = completed ? total : stepIndex;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="guide-panel fixed bottom-5 right-5 z-[2001] flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700"
        aria-label="Show guided assistance"
      >
        <Compass size={16} /> Guide · {done}/{total}
      </button>
    );
  }

  return (
    <aside
      className="guide-panel fixed bottom-5 right-5 z-[2001] w-[340px] max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)]"
      role="complementary"
      aria-label="Guided assistance"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <Compass size={15} className="text-indigo-600" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{journey.name}</span>
        <span className="ml-auto text-[11px] font-semibold text-slate-400">{Math.min(done + (completed ? 0 : 1), total)} / {total}</span>
        <button type="button" onClick={() => setCollapsed(true)} className="text-slate-400 hover:text-slate-700" aria-label="Minimize">
          <X size={15} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-slate-100">
        <div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <div className="p-4">
        {completed ? (
          <>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-green-700">
              <Check size={16} /> {journey.name} — complete
            </div>
            <p className="text-sm text-slate-600">You’ve completed every step of this guide. Nice work.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => dismissJourney(journey.id)} className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Finish</button>
            </div>
          </>
        ) : step ? (
          <>
            <div className="mb-1 text-[15px] font-bold text-charcoal-heading">{step.title}</div>
            <p className="text-sm text-slate-600">{step.body}</p>

            {onRoute ? (
              step.hint && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-[13px] font-semibold text-indigo-700">
                  <ArrowRight size={14} /> {step.hint}
                </div>
              )
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-600">
                <Compass size={14} className="text-indigo-600" /> Go to <span className="font-semibold text-slate-800">{step.routeLabel}</span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => signal(step.completeOn)}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
              >
                <SkipForward size={13} /> Skip step
              </button>
              <button
                type="button"
                onClick={() => setGuideEnabled(false)}
                className="text-[13px] font-medium text-slate-400 hover:text-slate-700"
              >
                Turn off
              </button>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
