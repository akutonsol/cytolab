'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Send, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { type FhirEndpoint, type FhirPreview } from '@/lib/fhir';

export function FhirTransmitModal({ recordId, onClose }: { recordId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [endpointId, setEndpointId] = useState('');
  const [showJson, setShowJson] = useState(false);

  const { data: endpoints = [] } = useQuery<FhirEndpoint[]>({ queryKey: ['fhir-endpoints'], queryFn: () => api.get('/fhir/endpoints').then((r) => r.data) });
  const { data: preview } = useQuery<FhirPreview>({ queryKey: ['fhir-preview', recordId], queryFn: () => api.get(`/fhir/preview/${recordId}`).then((r) => r.data) });
  const active = useMemo(() => endpoints.filter((e) => e.isActive), [endpoints]);

  const transmit = useMutation({
    mutationFn: () => api.post(`/fhir/transmit/${recordId}`, { endpointId }).then((r) => r.data),
    onSuccess: (r) => { message.success(`Transmitted (${r.status})`); ['fhir-transmissions', 'fhir-stats', 'fhir-record'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onClose(); },
    onError: () => message.error('Transmit failed'),
  });
  const copyJson = () => { if (preview) { navigator.clipboard.writeText(JSON.stringify(preview.diagnosticReport, null, 2)); message.success('FHIR JSON copied'); } };

  return createPortal(
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 2300, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[640px] flex-col rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Transmit to EMR</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Destination endpoint</label>
          <select value={endpointId} onChange={(e) => setEndpointId(e.target.value)} className="h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]">
            <option value="">Select endpoint…</option>
            {active.map((e) => <option key={e.id} value={e.id}>{e.name}{e.isSandbox ? ' (sandbox)' : ''}</option>)}
          </select>
          {active.length === 0 && <div className="mt-2 text-[13px] text-[#94A3B8]">No active endpoints — add one on the FHIR page first.</div>}

          <button onClick={() => setShowJson((v) => !v)} className="mt-4 text-[13px] font-semibold text-[#4F46E5] hover:underline">{showJson ? 'Hide' : 'Preview'} FHIR DiagnosticReport</button>
          {showJson && (
            <pre className="mt-2 max-h-[360px] overflow-auto rounded-xl p-3 font-mono text-[12px] leading-relaxed" style={{ background: '#0F172A', color: '#4ADE80' }}>{preview ? JSON.stringify(preview.diagnosticReport, null, 2) : 'Loading…'}</pre>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={copyJson} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]"><Copy size={15} /> Copy JSON</button>
          <button disabled={!endpointId || transmit.isPending} onClick={() => transmit.mutate()} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40"><Send size={15} /> Transmit</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
