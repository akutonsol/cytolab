'use client';

import { useState } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DictationProvider } from '@/lib/dictation-context';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
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
            colorWarning: '#f59e0b',
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
          <QueryClientProvider client={queryClient}>
            <DictationProvider>{children}</DictationProvider>
          </QueryClientProvider>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
