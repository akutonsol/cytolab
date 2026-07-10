'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AUTH_TYPES, EMR_SYSTEMS, EMR_META, type EMRSystem, type FHIRAuthType, type FhirEndpoint } from '@/lib/fhir';
import { IconAction } from '@/components/ui';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
const lbl = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]';

export function AddEndpointModal({ endpoint, onClose }: { endpoint?: FhirEndpoint; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const editing = !!endpoint;
  const [name, setName] = useState(endpoint?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.baseUrl ?? '');
  const [system, setSystem] = useState<EMRSystem>(endpoint?.system ?? 'Epic');
  const [authType, setAuthType] = useState<FHIRAuthType>(endpoint?.authType ?? 'Bearer');
  const [authToken, setAuthToken] = useState('');
  const [clientId, setClientId] = useState(endpoint?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [isSandbox, setIsSandbox] = useState(endpoint?.isSandbox ?? true);
  const [testResult, setTestResult] = useState<{ ok: boolean; status: string } | null>(null);

  const invalidate = () => ['fhir-endpoints', 'fhir-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const body = () => ({
    name, baseUrl, system, authType, isSandbox,
    ...(authToken && { authToken }), ...(clientId && { clientId }), ...(clientSecret && { clientSecret }),
  });

  const save = useMutation({
    mutationFn: () => (editing ? api.patch(`/fhir/endpoints/${endpoint!.id}`, body()) : api.post('/fhir/endpoints', body())).then((r) => r.data),
    onSuccess: () => { message.success(editing ? 'Endpoint updated' : 'Endpoint added'); invalidate(); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not save endpoint'),
  });
  const test = useMutation({
    mutationFn: () => api.post(`/fhir/endpoints/${endpoint!.id}/test`).then((r) => r.data),
    onSuccess: (r) => { setTestResult({ ok: r.ok, status: r.status }); invalidate(); },
    onError: () => setTestResult({ ok: false, status: 'Test request failed' }),
  });

  const showToken = authType === 'Bearer' || authType === 'APIKey';
  const showOAuth = authType === 'OAuth2';

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">{editing ? 'Edit Endpoint' : 'Add Endpoint'}</h3>
          <IconAction icon={<X size={16} />} tone="strong" onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3"><label className={lbl}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kingston Hospital Epic" className={inp} /></div>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>EMR System</label>
              <select value={system} onChange={(e) => setSystem(e.target.value as EMRSystem)} className={inp}>{EMR_SYSTEMS.map((s) => <option key={s} value={s}>{EMR_META[s].label}</option>)}</select>
            </div>
            <div>
              <label className={lbl}>Auth Type</label>
              <select value={authType} onChange={(e) => setAuthType(e.target.value as FHIRAuthType)} className={inp}>{AUTH_TYPES.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            </div>
          </div>
          <div className="mb-3"><label className={lbl}>Base URL</label><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://epic.hospital.com/fhir/R4" className={inp} /></div>

          {showToken && (
            <div className="mb-3"><label className={lbl}>{authType === 'APIKey' ? 'API Key' : 'Auth Token'}</label><input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder={editing ? '•••••• (unchanged)' : 'token'} className={inp} /></div>
          )}
          {showOAuth && (
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div><label className={lbl}>Client ID</label><input value={clientId} onChange={(e) => setClientId(e.target.value)} className={inp} /></div>
              <div><label className={lbl}>Client Secret</label><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={editing ? '•••••• (unchanged)' : ''} className={inp} /></div>
            </div>
          )}

          <label className="mb-4 flex items-center gap-2 text-[14px] text-[#334155]">
            <input type="checkbox" checked={isSandbox} onChange={(e) => setIsSandbox(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" />
            Sandbox mode <span className="text-[12px] text-[#475569]">(builds + stores payload without transmitting)</span>
          </label>

          {/* Test connection (only meaningful for a saved endpoint) */}
          <div className="rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#334155]">Test Connection</span>
              <button disabled={!editing || test.isPending} onClick={() => test.mutate()} className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#4F46E5] disabled:opacity-40">{test.isPending ? 'Testing…' : 'Test'}</button>
            </div>
            {!editing && <div className="mt-1 text-[12px] text-[#475569]">Save the endpoint first to test connectivity.</div>}
            {testResult && (
              <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: testResult.ok ? '#16A34A' : '#B91C1C' }}>
                {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {testResult.status}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
          <button disabled={!name || !baseUrl || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">{editing ? 'Save Changes' : 'Add Endpoint'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
