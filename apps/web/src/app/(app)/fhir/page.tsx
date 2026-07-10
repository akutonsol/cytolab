'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Network, RefreshCw, Send } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/feature-context';
import { AddEndpointModal } from '@/components/AddEndpointModal';
import {
  EMR_META, STATUS_META, dateTime,
  type FhirEndpoint, type FhirPreview, type FhirStats, type FhirTransmission,
} from '@/lib/fhir';
import { Card, EmptyState } from '@/components/ui';


function Kpi({ label, value, fg = '#0F172A' }: { label: string; value: string; fg?: string }) {
  return <Card radius="md" elevation="soft" border="hairline" className="p-4"><div className="text-[24px] font-bold leading-none" style={{ color: fg }}>{value}</div><div className="mt-1.5 text-[13px] text-[#475569]">{label}</div></Card>;
}

export default function FhirPage() {
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('HL7_FHIR');
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [addOpen, setAddOpen] = useState(false);
  const [editEndpoint, setEditEndpoint] = useState<FhirEndpoint | null>(null);
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);
  const [transmitEndpoint, setTransmitEndpoint] = useState('');

  const { data: stats } = useQuery<FhirStats>({ queryKey: ['fhir-stats'], queryFn: () => api.get('/fhir/stats').then((r) => r.data), enabled });
  const { data: endpoints = [] } = useQuery<FhirEndpoint[]>({ queryKey: ['fhir-endpoints'], queryFn: () => api.get('/fhir/endpoints').then((r) => r.data), enabled });
  const { data: log = [] } = useQuery<FhirTransmission[]>({ queryKey: ['fhir-transmissions'], queryFn: () => api.get('/fhir/transmissions').then((r) => r.data), enabled });
  const { data: preview } = useQuery<FhirPreview>({ queryKey: ['fhir-preview', previewRecordId], enabled: !!previewRecordId, queryFn: () => api.get(`/fhir/preview/${previewRecordId}`).then((r) => r.data) });

  const invalidate = () => ['fhir-transmissions', 'fhir-stats'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/fhir/endpoints/${id}/test`).then((r) => r.data),
    onSuccess: (r) => { message[r.ok ? 'success' : 'error'](r.ok ? `Connected: ${r.status}` : `Test failed: ${r.status}`); qc.invalidateQueries({ queryKey: ['fhir-endpoints'] }); },
    onError: () => message.error('Test request failed'),
  });
  const retry = useMutation({
    mutationFn: (recordId: string) => api.post(`/fhir/transmit/${recordId}/retry`).then((r) => r.data),
    onSuccess: () => { message.success('Retransmitted'); invalidate(); },
    onError: () => message.error('Retry failed'),
  });
  const transmit = useMutation({
    mutationFn: (v: { recordId: string; endpointId: string }) => api.post(`/fhir/transmit/${v.recordId}`, { endpointId: v.endpointId }).then((r) => r.data),
    onSuccess: (r) => { message.success(`Transmitted (${r.status})`); invalidate(); },
    onError: () => message.error('Transmit failed'),
  });

  const copyJson = () => { if (preview) { navigator.clipboard.writeText(JSON.stringify(preview.diagnosticReport, null, 2)); message.success('FHIR JSON copied'); } };

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<Network size={28} />}
              title={<>Feature not enabled</>}
              description={<>HL7/FHIR Integration is disabled for this lab.</>}
            />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-[#0F172A]">HL7/FHIR Integration</h1>
          <p className="mt-1.5 text-[15px] text-[#6B7280]">Send authorized results to hospital EMRs as FHIR R4 resources.</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white">Add Endpoint</button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Active Endpoints" value={String(stats?.activeEndpoints ?? 0)} />
        <Kpi label="Total Transmitted" value={String(stats?.totalTransmissions ?? 0)} />
        <Kpi label="Success Rate" value={`${stats?.successRate ?? 0}%`} fg="#16A34A" />
        <Kpi label="Failed" value={String(stats?.failed ?? 0)} fg={(stats?.failed ?? 0) > 0 ? '#B91C1C' : '#0F172A'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* LEFT — transmission log */}
        <Card radius="md" elevation="soft" border="hairline" className="overflow-hidden lg:col-span-3">
          <div className="border-b border-[#EEF2F7] px-4 py-3"><h2 className="text-[15px] font-bold text-[#0F172A]">Transmission Log</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase tracking-wide text-[#475569]">
                <th className="px-3 py-2.5 font-semibold">Record</th><th className="px-3 py-2.5 font-semibold">Patient</th><th className="px-3 py-2.5 font-semibold">Endpoint</th>
                <th className="px-3 py-2.5 font-semibold">Status</th><th className="px-3 py-2.5 font-semibold">Sent</th><th className="px-3 py-2.5 font-semibold"></th>
              </tr></thead>
              <tbody>
                {log.length === 0 ? <tr><td colSpan={6} className="px-3 py-12 text-center text-[#475569]">No transmissions yet.</td></tr> : log.map((t) => {
                  const s = STATUS_META[t.status];
                  return (
                    <tr key={t.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="px-3 py-2.5 font-mono font-semibold text-[#4F46E5]">{t.record.labNumber ?? t.record.identifier}</td>
                      <td className="px-3 py-2.5 text-[#0F172A]">{t.record.patient ? `${t.record.patient.firstName} ${t.record.patient.lastName}` : '—'}</td>
                      <td className="px-3 py-2.5 text-[#334155]">{t.endpoint.name}</td>
                      <td className="px-3 py-2.5"><span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: s.bg, color: s.fg }}>{s.spin && <Loader2 size={11} className="animate-spin" />}{s.label}</span></td>
                      <td className="px-3 py-2.5 text-[#475569]">{dateTime(t.transmittedAt ?? t.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setPreviewRecordId(t.recordId)} className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5]">Preview</button>
                          {t.status === 'Failed' && <button onClick={() => retry.mutate(t.recordId)} className="flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2 py-1 text-[12px] font-semibold text-[var(--color-warning)]"><RefreshCw size={12} /> Retry</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* RIGHT — endpoints */}
        <Card radius="md" elevation="soft" border="hairline" className="flex flex-col lg:col-span-2">
          <div className="border-b border-[#EEF2F7] px-4 py-3"><h2 className="text-[15px] font-bold text-[#0F172A]">EMR Endpoints</h2></div>
          <div className="flex flex-col gap-2 p-3">
            {endpoints.length === 0 ? <div className="py-8 text-center text-[13px] text-[#475569]">No endpoints configured.</div> : endpoints.map((e) => {
              const m = EMR_META[e.system];
              const tested = e.lastTestStatus;
              const testOk = tested ? !/^Failed/i.test(tested) : null;
              return (
                <div key={e.id} className="rounded-xl border border-[#EEF2F7] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-bold text-[#0F172A]">{e.name}</span>
                        <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: m.bg, color: m.fg }}>{m.label}</span>
                        {e.isSandbox && <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: '#FFFBEB', color: 'var(--color-warning)' }}>SANDBOX</span>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-[#475569]">{e.baseUrl}</div>
                      {tested && <div className="mt-1 flex items-center gap-1 text-[12px] font-semibold" style={{ color: testOk ? '#16A34A' : '#B91C1C' }}>{testOk ? '✓' : '✗'} {tested}</div>}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => test.mutate(e.id)} disabled={test.isPending} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-semibold text-[#4F46E5] disabled:opacity-40">Test</button>
                    <button onClick={() => setEditEndpoint(e)} className="rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-semibold text-[#475569]">Edit</button>
                    <span className="ml-auto self-center text-[11px] text-[#475569]">{e._count?.transmissions ?? 0} sent</span>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setAddOpen(true)} className="mt-1 rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-[13px] font-semibold text-[#4F46E5]">+ Add Endpoint</button>
          </div>
        </Card>
      </div>

      {/* FHIR preview (terminal style) */}
      {previewRecordId && (
        <Card radius="md" elevation="soft" border="hairline" className="mt-4 overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#EEF2F7] px-4 py-3">
            <h2 className="text-[15px] font-bold text-[#0F172A]">FHIR DiagnosticReport Preview</h2>
            <div className="flex items-center gap-2">
              <select value={transmitEndpoint} onChange={(e) => setTransmitEndpoint(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2 text-[13px]">
                <option value="">Select endpoint…</option>
                {endpoints.filter((e) => e.isActive).map((e) => <option key={e.id} value={e.id}>{e.name}{e.isSandbox ? ' (sandbox)' : ''}</option>)}
              </select>
              <button disabled={!transmitEndpoint || transmit.isPending} onClick={() => transmit.mutate({ recordId: previewRecordId, endpointId: transmitEndpoint })} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"><Send size={14} /> Transmit</button>
              <button onClick={copyJson} className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] font-semibold text-[#475569]"><Copy size={14} /> Copy JSON</button>
              <button onClick={() => setPreviewRecordId(null)} className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-[13px] font-semibold text-[#475569]">Close</button>
            </div>
          </div>
          <pre className="max-h-[520px] overflow-auto p-4 font-mono text-[12px] leading-relaxed" style={{ background: '#0F172A', color: '#4ADE80' }}>{preview ? JSON.stringify(preview.diagnosticReport, null, 2) : 'Loading…'}</pre>
        </Card>
      )}

      {addOpen && <AddEndpointModal onClose={() => setAddOpen(false)} />}
      {editEndpoint && <AddEndpointModal endpoint={editEndpoint} onClose={() => setEditEndpoint(null)} />}
    </div>
  );
}
