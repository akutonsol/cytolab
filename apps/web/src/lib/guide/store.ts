'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Guided-assistance state. Mirrors the useAuthStore persist pattern.
 *
 * The engine is state-driven: `signals` records which milestones the user has
 * completed (fired from real mutation success sites), and the current step is
 * derived as the first journey step whose completing signal hasn't fired yet.
 * So it "picks up where you are" rather than running a fixed linear tour.
 */
interface GuideState {
  enabled: boolean;
  signals: string[]; // completed milestone signals (progress)
  dismissed: string[]; // journey ids the user dismissed
  collapsed: boolean; // coach panel minimized
  setEnabled: (v: boolean) => void;
  signal: (name: string) => void;
  dismissJourney: (id: string) => void;
  restart: (id: string) => void;
  setCollapsed: (v: boolean) => void;
}

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => ({
      enabled: false,
      signals: [],
      dismissed: [],
      collapsed: false,
      setEnabled: (v) => set({ enabled: v, ...(v ? { collapsed: false } : {}) }),
      // Only records progress while enabled; ignores duplicates.
      signal: (name) => {
        const s = get();
        if (!s.enabled || s.signals.includes(name)) return;
        set({ signals: [...s.signals, name] });
      },
      dismissJourney: (id) => set((s) => (s.dismissed.includes(id) ? s : { dismissed: [...s.dismissed, id] })),
      restart: (id) => set({ dismissed: get().dismissed.filter((d) => d !== id), signals: [], collapsed: false }),
      setCollapsed: (v) => set({ collapsed: v }),
    }),
    {
      name: 'cytolab-guide',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ enabled: s.enabled, signals: s.signals, dismissed: s.dismissed }),
    },
  ),
);

/**
 * Fire a guide milestone from anywhere (e.g. a mutation onSuccess) without a
 * hook. No-op unless guided assistance is enabled.
 */
export const fireGuideSignal = (name: string) => useGuideStore.getState().signal(name);
