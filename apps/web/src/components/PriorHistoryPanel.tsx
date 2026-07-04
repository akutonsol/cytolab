'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarClock, FileText, History, Stethoscope, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface HistoryRecord {
  id: string;
  recordNumber: string;
  labNumber: string | null;
  formType: string | null;
  specimenDate: string | null;
  specimenType: string | null;
  requisitionId: string | null;
  doctorName: string | null;
  clinicalDiagnosis: string | null;
  status: string;
  authorized: boolean;
  authorizedAt: string | null;
  narrative: string | null;
  findings: string[];
  abnormalFindings: string[];
  createdAt: string;
}
interface History {
  patientId: string;
  patientName: string;
  patientDob: string | null;
  totalRecords: number;
  records: HistoryRecord[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  patientId?: string | null;
  /** Exclude the record currently being reported so history = truly prior. */
  excludeRecordId?: string;
}

const STATUS: Record<string, { bg: string; color: string }> = {
  Approved: { bg: '#F0FDF4', color: '#16A34A' }, Billed: { bg: '#F0FDF4', color: '#16A34A' }, Paid: { bg: '#F0FDF4', color: '#16A34A' },
  Resulted: { bg: '#EEF2FF', color: '#4F46E5' }, Completed: { bg: '#EEF2FF', color: '#4F46E5' },
  Failed: { bg: '#FEF2F2', color: '#DC2626' }, Disabled: { bg: '#FEF2F2', color: '#DC2626' },
};
const statusStyle = (s: string) => STATUS[s] ?? { bg: '#F1F5F9', color: '#64748B' };
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  const d = new Date(dob); const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
};

export function PriorHistoryPanel({ open, onClose, patientId, excludeRecordId }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['patient-history', patientId, excludeRecordId],
    queryFn: () => api.get<History>(`/patients/${patientId}/history`, { params: excludeRecordId ? { excludeRecordId } : undefined }).then((r) => r.data),
    enabled: open && !!patientId,
  });

  // Distinct abnormal findings across all prior records — the key clinical signal.
  const priorAbnormal = useMemo(() => {
    const s = new Set<string>();
    (data?.records ?? []).forEach((r) => r.abnormalFindings.forEach((a) => s.add(a)));
    return Array.from(s);
  }, [data]);

  if (!open || typeof document === 'undefined') return null;
  const age = ageFrom(data?.patientDob);

  return createPortal(
    <div className="fixed inset-0 flex justify-end" style={{ zIndex: 2100, background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div className="flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><History size={20} /></span>
            <div>
              <h3 className="font-headline-sm text-headline-sm text-charcoal-heading">Prior Cytology History</h3>
              <p className="mt-0.5 font-body-sm text-body-sm text-secondary">
                {data ? `${data.patientName}${age !== null ? ` · ${age} yrs` : ''} · ${data.totalRecords} prior record${data.totalRecords === 1 ? '' : 's'}` : 'Loading…'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-secondary hover:bg-slate-100"><X size={16} /></button>
        </div>

        {/* Prior-abnormal alert */}
        {priorAbnormal.length > 0 && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl border px-4 py-3" style={{ background: '#FEF2F2', borderColor: '#FECACA' }}>
            <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: '#DC2626' }} />
            <div>
              <div className="font-label-md text-label-md font-semibold" style={{ color: '#991B1B' }}>Prior abnormal findings on record</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {priorAbnormal.map((a) => <span key={a} className="rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{a}</span>)}
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="py-16 text-center font-body-sm text-body-sm text-secondary">Loading history…</div>
          ) : (data?.records ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <History size={44} className="text-[#E2E8F0]" />
              <p className="font-headline-sm text-headline-sm text-charcoal-heading">No prior history</p>
              <p className="max-w-xs font-body-sm text-body-sm text-secondary">This is the patient’s first cytology record in the lab.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {data!.records.map((r) => {
                const st = statusStyle(r.status);
                const isGyn = r.formType === 'Gynecology';
                const open = expanded === r.id;
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarClock size={15} className="text-secondary" />
                        <span className="font-body-sm text-body-sm font-semibold text-charcoal-heading">{fmtDate(r.specimenDate ?? r.createdAt)}</span>
                        {r.labNumber && <span className="rounded-md bg-primary-fixed px-1.5 py-0.5 font-mono text-[12px] text-primary">{r.labNumber}</span>}
                      </div>
                      <span style={{ background: st.bg, color: st.color }} className="shrink-0 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium">{r.status}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.formType && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{isGyn ? 'GYN' : 'NON-GYN'}</span>}
                      {r.specimenType && <span className="font-body-sm text-body-sm text-secondary">{r.specimenType}</span>}
                    </div>

                    {(r.doctorName || r.clinicalDiagnosis) && (
                      <div className="mt-2 flex flex-col gap-0.5 font-body-sm text-body-sm text-secondary">
                        {r.doctorName && <span className="inline-flex items-center gap-1.5"><Stethoscope size={13} /> Dr. {r.doctorName}</span>}
                        {r.clinicalDiagnosis && <span className="italic">“{r.clinicalDiagnosis}”</span>}
                      </div>
                    )}

                    {/* Findings */}
                    {(r.findings.length > 0 || r.abnormalFindings.length > 0) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {r.abnormalFindings.map((a) => (
                          <span key={a} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold" style={{ background: '#FEE2E2', color: '#B91C1C' }}><AlertTriangle size={10} /> {a}</span>
                        ))}
                        {r.findings.filter((f) => !r.abnormalFindings.includes(f)).map((f) => (
                          <span key={f} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-600">{f}</span>
                        ))}
                      </div>
                    )}

                    {/* Narrative (authorized) */}
                    {r.authorized && r.narrative && (
                      <div className="mt-3 rounded-lg bg-surface-container-low p-3">
                        <div className="mb-1 inline-flex items-center gap-1.5 font-label-sm text-label-sm font-semibold text-secondary"><FileText size={12} /> Report narrative</div>
                        <p className={`whitespace-pre-line font-body-sm text-body-sm text-on-surface ${open ? '' : 'line-clamp-3'}`}>{r.narrative}</p>
                        {r.narrative.length > 160 && (
                          <button onClick={() => setExpanded(open ? null : r.id)} className="mt-1 font-label-sm text-label-sm font-semibold text-primary hover:underline">{open ? 'Show less' : 'Read more'}</button>
                        )}
                      </div>
                    )}
                    {r.authorized && r.authorizedAt && <div className="mt-2 font-label-sm text-label-sm text-secondary">Authorized {fmtDate(r.authorizedAt)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
