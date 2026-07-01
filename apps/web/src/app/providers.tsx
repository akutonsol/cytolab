'use client';

import { useState } from 'react';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import { App as AntdApp, ConfigProvider, theme } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
            // Mirror the design-foundation tokens so AntD plumbing (tables,
            // buttons, inputs, tags, dropdowns) matches the premium primitives.
            colorPrimary: '#4f7df9',
            colorInfo: '#4f7df9',
            colorSuccess: '#16a34a',
            colorWarning: '#d97706',
            colorError: '#dc2626',
            colorText: '#1a1d21',
            colorTextSecondary: '#6b7280',
            colorBorder: '#e1e4e9',
            colorBorderSecondary: '#edeff2',
            borderRadius: 12,
            borderRadiusLG: 20,
            borderRadiusSM: 8,
            fontFamily:
              "var(--font-jakarta), 'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
            controlHeight: 40,
            boxShadow: '0 1px 3px rgba(16,24,40,0.04), 0 1px 2px rgba(16,24,40,0.03)',
          },
          components: {
            Button: { borderRadius: 12, controlHeight: 40, fontWeight: 600 },
            Card: { borderRadiusLG: 20 },
            Table: { headerBg: '#fafbfc', headerColor: '#6b7280', rowHoverBg: '#f7f9fc' },
            Tag: { borderRadiusSM: 999 },
          },
        }}
      >
        <AntdApp>
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </AntdApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
