'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, fieldClass, cn } from '@/components/ui';

interface AiSettings {
  enabled: boolean;
  houseStyle: string | null;
  redactionPolicy: 'Strict' | 'Standard';
  model: string | null;
  hasApiKey: boolean;
}

const FIELD_LABEL = 'mb-1 block font-label-sm text-label-sm text-secondary';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: checked ? '#4F46E5' : '#c7c4d8' }}>
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}

/**
 * Settings > General > AI Assistance. Off by default. AI is strictly assistive —
 * nothing generated here is ever released without human authorization.
 */
export function AiSettingsPane() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };
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
    onSuccess: () => { notify('ok', 'AI settings saved'); qc.invalidateQueries({ queryKey: ['ai-settings'] }); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Save failed'),
  });

  return (
    <div className="max-w-[640px]">
      <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">AI Assistance</h3>
      <p className="mt-1 font-body-sm text-body-sm text-secondary">
        AI helps Authorizers draft narratives, suggest codes, and check consistency. It is strictly assistive —
        nothing AI-generated is ever released without human authorization. Only de-identified clinical data is
        sent; patient identifiers are never transmitted.
      </p>

      {data && !data.hasApiKey && (
        <div className="mt-4 flex items-start gap-3 rounded-xl p-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--color-warning)' }} />
          <div>
            <div className="font-label-md text-label-md" style={{ color: 'var(--color-warning)' }}>No API key configured on the server</div>
            <div className="font-body-sm text-body-sm text-secondary">AI actions stay unavailable to authorizers until ANTHROPIC_API_KEY is set, even if enabled here.</div>
          </div>
        </div>
      )}

      <div className="mt-5 flex w-full flex-col gap-[18px]">
        <div className="flex items-center gap-3">
          <Toggle checked={!!form.enabled} onChange={(v) => setForm((f) => ({ ...f, enabled: v }))} />
          <span className="font-body-sm text-body-sm text-on-surface">Enable AI assistance for this lab</span>
        </div>

        <div>
          <span className={FIELD_LABEL}>Redaction policy</span>
          <select
            className={cn(fieldClass({ family: 'reference', border: 'outline' }), 'w-[320px] max-w-full')}
            value={form.redactionPolicy ?? 'Strict'}
            onChange={(e) => setForm((f) => ({ ...f, redactionPolicy: e.target.value as AiSettings['redactionPolicy'] }))}
          >
            <option value="Strict">Strict — clinical data only (no demographics)</option>
            <option value="Standard">Standard — adds de-identified sex + age band</option>
          </select>
        </div>

        <div>
          <span className={FIELD_LABEL}>House style / template (optional)</span>
          <textarea
            rows={4} placeholder="Guidance the draft narrative should follow (tone, structure, standard phrasing)…"
            value={form.houseStyle ?? ''} onChange={(e) => setForm((f) => ({ ...f, houseStyle: e.target.value }))}
            className={cn(fieldClass({ family: 'reference', border: 'outline' }), 'h-auto py-2.5')} style={{ resize: 'vertical' }}
          />
        </div>

        <div>
          <span className={FIELD_LABEL}>Model override (optional)</span>
          <Input family="reference" border="outline" className="w-[320px] max-w-full" placeholder="claude-sonnet-4-6 (default)" value={form.model ?? ''} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
        </div>

        <div>
          <Button disabled={save.isPending} style={{ opacity: save.isPending ? 0.6 : 1 }} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-[120] rounded-xl px-4 py-3 font-label-md text-label-md text-white shadow-lg"
          style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
