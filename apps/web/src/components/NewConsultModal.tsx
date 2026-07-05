'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, ShieldCheck, X } from 'lucide-react';
import { App as AntdApp } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { URGENCY_META, type ConsultPrefill, type ConsultUrgency } from '@/lib/teleconsult';

const inp = 'h-10 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-[14px] outline-none focus:border-[#4F46E5]';
const ta = 'w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#4F46E5]';
const lbl = 'mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#475569]';

export function NewConsultModal({ recordId: fixedRecordId, onClose, onCreated }: { recordId?: string; onClose: () => void; onCreated?: (id: string) => void }) {
  const qc = useQueryClient();
  const { message } = AntdApp.useApp();
  const [recordId, setRecordId] = useState(fixedRecordId ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [clinicalSummary, setSummary] = useState('');
  const [specificQuestion, setQuestion] = useState('');
  const [urgency, setUrgency] = useState<ConsultUrgency>('Routine');
  const [dueDate, setDueDate] = useState('');
  const [sharedNarrative, setNarrative] = useState(true);
  const [sharedBethesda, setBethesda] = useState(true);
  const [sharedImages, setImages] = useState(false);

  const { data: recordsPage } = useQuery<Paginated<any>>({
    queryKey: ['consult-records'], enabled: !fixedRecordId,
    queryFn: () => api.get('/specimens', { params: { pageSize: 300 } }).then((r) => r.data),
  });
  const { data: prefill } = useQuery<ConsultPrefill>({
    queryKey: ['consult-prefill', recordId], enabled: !!recordId,
    queryFn: () => api.get(`/teleconsult/prefill/${recordId}`).then((r) => r.data),
  });
  useEffect(() => { if (!prefill?.hasWsi) setImages(false); }, [prefill?.hasWsi]);

  const save = useMutation({
    mutationFn: () => api.post('/teleconsult', {
      recordId, consultantName: name, consultantEmail: email, consultantInstitution: institution || undefined,
      clinicalSummary, specificQuestion, urgency, dueDate: dueDate || undefined,
      sharedNarrative, sharedBethesda, sharedImages,
    }).then((r) => r.data),
    onSuccess: (c) => { message.success('Consultation request sent'); ['teleconsult', 'consult-analytics'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); onCreated?.(c.id); onClose(); },
    onError: (e: any) => message.error(e?.response?.data?.message ?? 'Could not send request'),
  });

  const valid = recordId && name && email && clinicalSummary && specificQuestion;

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2200, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5">
          <h3 className="text-[18px] font-bold text-[#0F172A]">New Consultation</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[#475569] hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Record */}
          {!fixedRecordId && (
            <div className="mb-4">
              <label className={lbl}>Record (by lab number)</label>
              <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className={inp}>
                <option value="">Select record…</option>
                {(recordsPage?.data ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.labNumber ?? r.identifier}</option>)}
              </select>
            </div>
          )}

          {/* De-identified auto-populated info */}
          {prefill && (
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[#EEF2F7] bg-[#F8FAFC] px-4 py-3 text-[13px]">
              <span className="flex items-center gap-1.5 font-semibold text-[#16A34A]"><ShieldCheck size={14} /> De-identified</span>
              <span className="text-[#475569]">Patient: <span className="font-semibold text-[#334155]">{prefill.patientInitials}</span></span>
              <span className="text-[#475569]">{prefill.specimenType}</span>
              {prefill.bethesdaClassification && <span className="text-[#475569]">Bethesda: <span className="font-semibold text-[#334155]">{prefill.bethesdaClassification}</span></span>}
            </div>
          )}

          {/* Consultant */}
          <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Consultant Details</div>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={lbl}>Name</label><input value={name} onChange={(e) => setName(e.target.value)} className={inp} placeholder="Dr. …" /></div>
            <div><label className={lbl}>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} placeholder="name@institution.org" /></div>
            <div><label className={lbl}>Institution</label><input value={institution} onChange={(e) => setInstitution(e.target.value)} className={inp} placeholder="(optional)" /></div>
          </div>

          {/* Case info */}
          <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Case Information</div>
          <div className="mb-3"><label className={lbl}>Clinical Summary (anonymized)</label><textarea rows={3} value={clinicalSummary} onChange={(e) => setSummary(e.target.value)} className={ta} placeholder="Age, history, presentation — no identifying details" /></div>
          <div className="mb-3"><label className={lbl}>Specific Question</label><textarea rows={2} value={specificQuestion} onChange={(e) => setQuestion(e.target.value)} className={ta} placeholder="What opinion do you need?" /></div>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Urgency</label>
              <div className="flex gap-1.5">
                {(['Routine', 'Priority', 'Urgent'] as ConsultUrgency[]).map((u) => (
                  <button key={u} onClick={() => setUrgency(u)} className="flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors"
                    style={urgency === u ? { borderColor: URGENCY_META[u].fg, background: URGENCY_META[u].bg, color: URGENCY_META[u].fg } : { borderColor: '#E2E8F0', color: '#475569' }}>{u}</button>
                ))}
              </div>
            </div>
            <div><label className={lbl}>Due Date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inp} /></div>
          </div>

          {/* Share */}
          <div className="mb-2 text-[13px] font-bold text-[#0F172A]">Share With Consultant</div>
          <div className="mb-4 flex flex-col gap-2 text-[13px] text-[#334155]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={sharedNarrative} onChange={(e) => setNarrative(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" /> Narrative report</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={sharedBethesda} onChange={(e) => setBethesda(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" /> Bethesda classification</label>
            <label className={`flex items-center gap-2 ${!prefill?.hasWsi ? 'opacity-40' : ''}`}>
              <input type="checkbox" checked={sharedImages} disabled={!prefill?.hasWsi} onChange={(e) => setImages(e.target.checked)} className="h-4 w-4 accent-[#4F46E5]" />
              Digital slide images {!prefill?.hasWsi && <span className="text-[11px] text-[#475569]">(no slide available)</span>}
            </label>
          </div>

          {/* Preview */}
          <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] p-4">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#4F46E5]"><Eye size={13} /> The consultant will see</div>
            <ul className="flex flex-col gap-1 text-[13px] text-[#334155]">
              <li>Case reference (not the patient record ID)</li>
              <li>Patient: <span className="font-semibold">{prefill?.patientInitials ?? '—'}</span> · {prefill?.specimenType ?? 'specimen type'}</li>
              <li>Clinical summary + your specific question</li>
              {sharedNarrative && <li>✓ Narrative report</li>}
              {sharedBethesda && <li>✓ Bethesda classification{prefill?.bethesdaClassification ? ` (${prefill.bethesdaClassification})` : ''}</li>}
              {sharedImages && <li>✓ Digital slide images</li>}
              <li className="text-[#16A34A]">No patient name, DOB, or identifying information.</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button onClick={onClose} className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[14px] font-semibold text-[#475569]">Cancel</button>
          <button disabled={!valid || save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Send Consultation Request</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
