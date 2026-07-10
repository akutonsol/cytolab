'use client';

import '@/lib/sentry.client'; // guarded Sentry init (no-op without DSN)
import { useEffect, useState } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query';
import { notify, setNotifier, errorMessage } from '@/lib/notify';
import { DictationProvider } from '@/lib/dictation-context';
import { FeatureProvider } from '@/lib/feature-context';
import { ThemeProvider } from '@/lib/theme-context';

/**
 * The product's modals and drawers are antd's, and antd shipped its own motion:
 * 300ms with the browser-default `ease` curve, plus six bespoke easings
 * (Circ/Back/Quint). None of it came from our tokens — the single most-animated surface
 * in the app was outside the motion system (EXPERIENCE_REPORT §1.2).
 *
 * These map antd's motion vocabulary onto ours. antd derives
 * motionDurationFast/Mid/Slow from motionBase + motionUnit, so both are set explicitly.
 *
 *   --duration-fast  120ms   --duration-base 200ms   --duration-slow 320ms
 *   --ease-standard   (0.22, 0.8, 0.2, 1)   state changes
 *   --ease-emphasized (0.22, 1, 0.36, 1)    entrances
 *
 * The Back/Quint/Circ curves are deliberately collapsed onto those two: a modal must not
 * overshoot in a way nothing else in the product does.
 */
const ANTD_MOTION = {
  motionUnit: 0.04,
  motionBase: 0.08,
  motionDurationFast: '0.12s',
  motionDurationMid: '0.2s',
  motionDurationSlow: '0.32s',
  motionEaseInOut: 'cubic-bezier(0.22, 0.8, 0.2, 1)',
  motionEaseOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  motionEaseInOutCirc: 'cubic-bezier(0.22, 0.8, 0.2, 1)',
  motionEaseOutCirc: 'cubic-bezier(0.22, 1, 0.36, 1)',
  motionEaseOutBack: 'cubic-bezier(0.22, 1, 0.36, 1)',
  motionEaseInBack: 'cubic-bezier(0.4, 0, 1, 1)',
  motionEaseInQuint: 'cubic-bezier(0.4, 0, 1, 1)',
  motionEaseOutQuint: 'cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

/** Live `prefers-reduced-motion`. antd motion is switched off entirely, not merely sped up. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * antd's `message` must come from App.useApp() to inherit theme + context.
 *
 * This bridge also owns two things antd does not give us:
 *
 *   1. aria-live POLARITY. antd renders one container for every message and marks it
 *      `aria-live="polite"`. Polite is right for a receipt ("Saved") and wrong for a
 *      failure the user must act on. We flip the container to `assertive` while an error
 *      is on screen and back to `polite` when it clears, so a success never interrupts
 *      and an error never waits its turn.
 *
 *   2. Keyboard dismiss. antd toasts are mouse-dismissable only. Escape clears them.
 *      Focus is untouched: the toasts are never focused, so nothing to restore.
 */
function NotifierBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => setNotifier(message), [message]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') notify.dismissAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const sync = () => {
      const container = document.querySelector<HTMLElement>('.ant-message');
      if (!container) return;
      const hasError = !!container.querySelector('.ant-message-error');
      container.setAttribute('aria-live', hasError ? 'assertive' : 'polite');
      // `atomic=false` so a new notice is announced on its own, not the whole stack again.
      container.setAttribute('aria-atomic', 'false');
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => observer.disconnect();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
        /**
         * Global safety net (Experience Principle §8: zero silent actions).
         *
         * 27 files ran mutations with no success/error handling at all — a failed save
         * looked exactly like a successful one. These caches guarantee that *any*
         * unhandled failure is spoken aloud, without touching a single call site.
         *
         * A per-call `onError` still wins: if the mutation defines one, we stay quiet and
         * let the screen say something more specific.
         */
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.options.onError) return;
            notify.error(errorMessage(error));
          },
          /**
           * Zero silent actions. 54 mutations across 27 files acknowledged nothing —
           * a save and a no-op looked identical.
           *
           * A mutation speaks for itself if it defines `onSuccess`. Otherwise this says
           * something generic. Two escape hatches, because a blanket "Saved" is
           * occasionally wrong (e.g. a mutation whose whole job is to navigate):
           *
           *   meta: { silent: true }              → say nothing, deliberately
           *   meta: { successMessage: 'Sent' }    → say this instead
           */
          onSuccess: (_data, _vars, _ctx, mutation) => {
            if (mutation.options.onSuccess) return;
            const meta = mutation.meta as { silent?: boolean; successMessage?: string } | undefined;
            if (meta?.silent) return;
            notify.success(meta?.successMessage ?? 'Saved');
          },
        }),
        queryCache: new QueryCache({
          onError: (error, query) => {
            // Background refetches fail quietly; only a visible, first-load failure speaks.
            if (query.state.data !== undefined) return;
            notify.error(errorMessage(error, 'Could not load this data. Please retry.'));
          },
        }),
      }),
  );

  return (
    <AntdRegistry>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            // Mirror the design-foundation tokens (exact spec) so AntD plumbing
            // (tables, buttons, inputs, tags, dropdowns) matches the primitives.
            colorPrimary: '#4f7df9',
            colorPrimaryHover: '#3b6cf5',
            colorInfo: '#4f7df9',
            colorSuccess: '#22c55e',
            // ZERO-ORANGE: #f59e0b trips r>200 && g∈[100,190] && b<90 and is banned
            // by name in CLAUDE.md. amber-700 (#a16207, r=161) is detector-safe.
            // AntD derives its warning shades from this hex, so it must be a literal.
            colorWarning: '#a16207',
            colorError: '#ef4444',
            colorText: '#111827',
            colorTextSecondary: '#6b7280',
            colorTextTertiary: '#9ca3af',
            colorTextQuaternary: '#d1d5db',
            colorBgLayout: '#f6f8fc',
            colorBorder: '#e6eaf2',
            colorBorderSecondary: '#edf2f7',
            borderRadius: 14,
            borderRadiusLG: 24,
            borderRadiusSM: 10,
            fontFamily:
              "var(--font-inter), 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            fontSize: 16,
            controlHeight: 48,
            boxShadow: '0 12px 30px rgba(16,24,40,0.05)',
            // One motion vocabulary for the whole application.
            ...ANTD_MOTION,
            motion: !reducedMotion,
          },
          components: {
            Button: { borderRadius: 14, controlHeight: 48, fontWeight: 600 },
            Card: { borderRadiusLG: 24, paddingLG: 28 },
            Input: { borderRadius: 18, controlHeight: 56, colorTextPlaceholder: '#a0aec0' },
            InputNumber: { borderRadius: 18, controlHeight: 56 },
            Select: { borderRadius: 18, controlHeight: 48 },
            Modal: { borderRadiusLG: 32 },
            Table: { headerColor: '#6b7280', rowHoverBg: '#fafbfd', borderColor: '#edf2f7', cellPaddingBlock: 18 },
            Tag: { borderRadiusSM: 999 },
          },
        }}
      >
        <AntdApp>
          <NotifierBridge />
          <QueryClientProvider client={queryClient}>
            <FeatureProvider>
              <ThemeProvider>
                <DictationProvider>{children}</DictationProvider>
              </ThemeProvider>
            </FeatureProvider>
          </QueryClientProvider>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
