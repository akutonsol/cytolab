'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { CORRELATION_RESULTS, HISTOLOGY_SOURCES, RESULT_META, type CorrelationResult, type HistologySource } from '@/lib/correlation';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#4F46E5]';
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-3.5"><label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</label>{children}</div>
);

export function AddCorrelationModal({ onClose, defaultPatientId }: { onClose: () => void; defaultPatientId?: string }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [patientId, setPatientId] = useState(defaultPatientId ?? '');
  const [cytologyRecordId, setCytologyRecordId] = useState('');
  const [cytologyDiagnosis, setCytologyDiagnosis] = useState('');
  const [histologyDate, setHistologyDate] = useState('');
  const [histologyDiagnosis, setHistologyDiagnosis] = useState('');
  const [histologySource, setHistologySource] = useState<HistologySource>('Internal');
  const [externalLabName, setExternalLabName] = useState('');
  const [correlationResult, setCorrelationResult] = useState<CorrelationResult | ''>('');
  const [discordanceReason, setDiscordanceReason] = useState('');

  const { data: patientsPage } = useQuery<Paginated<any>>({ queryKey: ['corr-patients'], queryFn: () => api.get('/patients', { params: { pageSize: 300 } }).then((r) => r.data), enabled: !defaultPatientId });
  const { data: recsPage } = useQuery<Paginated<any>>({ queryKey: ['corr-records', patientId], enabled: !!patientId, queryFn: () => api.get('/specimens/patient', { params: { patientId, pageSize: 100 } }).then((r) => r.data) });
  const records = recsPage?.data ?? [];

  // Auto-fill cytology diagnosis from the record's Bethesda short code, if any.
  const { data: bethesda } = useQuery<any>({ queryKey: ['corr-bethesda', cytologyRecordId], enabled: !!cytologyRecordId, queryFn: () => api.get(`/bethesda/record/${cytologyRecordId}`).then((r) => r.data) });
  useEffect(() => {
    if (bethesda && !cytologyDiagnosis) setCytologyDiagnosis(bethesda.shortCode || bethesda.generatedNarrative?.slice(0, 120) || '');
  }, [bethesda]); // eslint-disable-line react-hooks/exhaustive-deps

  const patients = patientsPage?.data ?? [];
  const patientLabel = useMemo(() => {
    if (defaultPatientId) return null;
    return patients.map((p: any) => ({ id: p.id, label: `${p.firstName} ${p.lastName}${p.registrationNo ? ` (${p.registrationNo})` : ''}` }));
  }, [patients, defaultPatientId]);

  const isDiscordant = correlationResult === 'MinorDiscordant' || correlationResult === 'MajorDiscordant';
  const canSave = !!patientId && !!cytologyRecordId && !!cytologyDiagnosis.trim() && (!isDiscordant || !!discordanceReason.trim());

  const save = useMutation({
    mutationFn: () => api.post('/correlation', {
      patientId, cytologyRecordId, cytologyDiagnosis,
      histologyDate: histologyDate || undefined,
      histologyDiagnosis: histologyDiagnosis || undefined,
      histologySource,
      externalLabName: histologySource === 'External' ? externalLabName || undefined : undefined,
      correlationResult: correlationResult || undefined,
      discordanceReason: isDiscordant ? discordanceReason || undefined : undefined,
    }),
    onSuccess: () => {
      message.success('Correlation case created');
      ['correlations', 'correlation-analytics', 'correlations-patient'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not create case'),
  });

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">Add Correlation</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#64748B] hover:bg-slate-100"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {!defaultPatientId && (
            <F label="Patient">
              <select value={patientId} onChange={(e) => { setPatientId(e.target.value); setCytologyRecordId(''); }} className={inp}>
                <option value="">Select a patient…</option>
                {patientLabel?.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </F>
          )}
          <F label="Cytology Record">
            <select value={cytologyRecordId} onChange={(e) => setCytologyRecordId(e.target.value)} className={inp} disabled={!patientId}>
              <option value="">{patientId ? 'Select a cytology record…' : 'Select a patient first'}</option>
              {records.map((r: any) => <option key={r.id} value={r.id}>{r.labNumber ?? r.identifier} · {r.formType ?? '—'} · {new Date(r.specimenDate ?? r.createdAt).toLocaleDateString()}</option>)}
            </select>
          </F>
          <F label="Cytology Diagnosis"><input value={cytologyDiagnosis} onChange={(e) => setCytologyDiagnosis(e.target.value)} placeholder="e.g. NILM, LSIL, HSIL…" className={inp} /></F>
          <div className="my-3 border-t border-[#F1F5F9]" />
          <F label="Histology Date"><input type="date" value={histologyDate} onChange={(e) => setHistologyDate(e.target.value)} className={inp} /></F>
          <F label="Histology Diagnosis"><textarea value={histologyDiagnosis} onChange={(e) => setHistologyDiagnosis(e.target.value)} rows={2} placeholder="Pathology diagnosis…" className={inp} /></F>
          <F label="Histology Source">
            <select value={histologySource} onChange={(e) => setHistologySource(e.target.value as HistologySource)} className={inp}>
              {HISTOLOGY_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>
          {histologySource === 'External' && <F label="External Lab Name"><input value={externalLabName} onChange={(e) => setExternalLabName(e.target.value)} className={inp} /></F>}
          <div className="my-3 border-t border-[#F1F5F9]" />
          <F label="Correlation Result">
            <div className="grid grid-cols-2 gap-2">
              {CORRELATION_RESULTS.map((r) => (
                <button key={r} type="button" onClick={() => setCorrelationResult(r)} className="rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
                  style={correlationResult === r ? { background: RESULT_META[r].bg, color: RESULT_META[r].fg, boxShadow: `inset 0 0 0 1.5px ${RESULT_META[r].fg}` } : { background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>
                  {RESULT_META[r].label}
                </button>
              ))}
            </div>
          </F>
          {isDiscordant && (
            <F label="Discordance Reason (required)"><textarea value={discordanceReason} onChange={(e) => setDiscordanceReason(e.target.value)} rows={2} placeholder="Why do the results differ…" className={`${inp} ${!discordanceReason.trim() ? 'border-[#FECACA]' : ''}`} /></F>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#64748B]">Cancel</button>
          <button disabled={!canSave || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Create Case</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
