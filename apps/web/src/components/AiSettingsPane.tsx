'use client';

import { useEffect, useState } from 'react';
import { Alert, App, Button, Input, Select, Space, Switch, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AiSettings {
  enabled: boolean;
  houseStyle: string | null;
  redactionPolicy: 'Strict' | 'Standard';
  model: string | null;
  hasApiKey: boolean;
}

/**
 * Settings > General > AI Assistance. Off by default. AI is strictly assistive —
 * nothing generated here is ever released without human authorization.
 */
export function AiSettingsPane() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { data } = useQuery<AiSettings>({ queryKey: ['ai-settings'], queryFn: () => api.get('/lab/ai-settings').then((r) => r.data) });

  const [form, setForm] = useState<Partial<AiSettings>>({});
  useEffect(() => { if (data) setForm({ enabled: data.enabled, houseStyle: data.houseStyle ?? '', redactionPolicy: data.redactionPolicy, model: data.model ?? '' }); }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/lab/ai-settings', {
      enabled: !!form.enabled,
      houseStyle: form.houseStyle || undefined,
      redactionPolicy: form.redactionPolicy,
      model: form.model || undefined,
    }),
    onSuccess: () => { message.success('AI settings saved'); qc.invalidateQueries({ queryKey: ['ai-settings'] }); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>AI Assistance</Typography.Title>
      <Typography.Paragraph type="secondary">
        AI helps Authorizers draft narratives, suggest codes, and check consistency. It is strictly assistive —
        nothing AI-generated is ever released without human authorization. Only de-identified clinical data is
        sent; patient identifiers are never transmitted.
      </Typography.Paragraph>

      {data && !data.hasApiKey && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message="No API key configured on the server"
          description="AI actions stay unavailable to authorizers until ANTHROPIC_API_KEY is set, even if enabled here." />
      )}

      <Space direction="vertical" size={18} style={{ width: '100%' }}>
        <Space align="center" size={12}>
          <Switch checked={!!form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          <span>Enable AI assistance for this lab</span>
        </Space>

        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Redaction policy</Typography.Text>
          <Select
            style={{ width: 320 }}
            value={form.redactionPolicy}
            onChange={(v) => setForm((f) => ({ ...f, redactionPolicy: v }))}
            options={[
              { value: 'Strict', label: 'Strict — clinical data only (no demographics)' },
              { value: 'Standard', label: 'Standard — adds de-identified sex + age band' },
            ]}
          />
        </div>

        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>House style / template (optional)</Typography.Text>
          <Input.TextArea
            rows={4} placeholder="Guidance the draft narrative should follow (tone, structure, standard phrasing)…"
            value={form.houseStyle ?? ''} onChange={(e) => setForm((f) => ({ ...f, houseStyle: e.target.value }))}
          />
        </div>

        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Model override (optional)</Typography.Text>
          <Input
            style={{ width: 320 }} placeholder="claude-sonnet-4-6 (default)"
            value={form.model ?? ''} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          />
        </div>

        <div>
          <Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
      </Space>
    </div>
  );
}
