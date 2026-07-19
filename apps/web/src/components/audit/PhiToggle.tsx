'use client';

import { ShieldAlert } from 'lucide-react';
import { cn } from '@/components/ui';

/**
 * Program 2 · P2-8B — PHI toggle SHELL. It only participates in query state (flips the `phi` flag).
 * The confirmation dialog, persistent logged-access banner, patient rendering, and fail-closed
 * auto-revert are P2-8D — intentionally NOT implemented here. Rendered only when the caller holds
 * audit:read_phi (gating happens in the page; this component assumes it is allowed to appear).
 */
export function PhiToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Reveal PHI in audit results"
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors duration-fast ease-standard',
        on
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900',
      )}
    >
      <ShieldAlert size={15} />
      <span>PHI view</span>
      <span
        aria-hidden
        className={cn(
          'relative h-4 w-7 rounded-full transition-colors duration-fast ease-standard',
          on ? 'bg-primary' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-fast ease-standard',
            on ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
