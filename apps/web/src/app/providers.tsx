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

/** antd's `message` must come from App.useApp() to inherit theme + context. */
function NotifierBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => setNotifier(message), [message]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
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
