'use client';

import { Switch } from 'antd';
import { Compass, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui';
import { useGuideStore } from '@/lib/guide/store';
import { setGuideEnabled } from '@/lib/guide/sync';
import { JOURNEYS } from '@/lib/guide/journeys';

/**
 * Settings pane for the guided-assistance layer. Enabling it turns on the
 * reactive coach (spotlight + corner panel) app-wide; it stays dormant until on.
 */
export function GuidedAssistancePane() {
  const enabled = useGuideStore((s) => s.enabled);
  const restart = useGuideStore((s) => s.restart);
  const signals = useGuideStore((s) => s.signals);
  const journey = JOURNEYS[0];

  return (
    <Card border="none" elevation="none" className="glass-card p-6">
      <div className="mb-1 flex items-center gap-2 font-headline-sm text-headline-sm text-charcoal-heading">
        <Compass size={18} className="text-indigo-600" /> Guided Assistance
      </div>
      <p className="mb-6 max-w-prose font-body-sm text-body-sm text-gray-600">
        An intelligent coach that watches where you are in a workflow and points you to the next
        step — a gentle highlight on the button to click and a narrated prompt in the corner. It
        reacts to what you do, so it always picks up from where you are. Off by default; nothing
        shows unless it&apos;s on.
      </p>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5">
        <div>
          <div className="text-sm font-semibold text-charcoal-heading">Enable guided assistance</div>
          <div className="text-[12px] text-slate-500">Show the coach and step highlights as you work.</div>
        </div>
        <Switch checked={enabled} onChange={setGuideEnabled} />
      </div>

      {enabled && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5">
          <div>
            <div className="text-sm font-semibold text-charcoal-heading">Restart the walkthrough</div>
            <div className="text-[12px] text-slate-500">
              {journey.name} · {Math.min(signals.length, journey.steps.length)} of {journey.steps.length} steps done
            </div>
          </div>
          <button
            type="button"
            onClick={() => restart(journey.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw size={14} /> Restart
          </button>
        </div>
      )}
    </Card>
  );
}
