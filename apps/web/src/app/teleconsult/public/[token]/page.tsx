'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, ShieldCheck } from 'lucide-react';
import { URGENCY_META, shortDate, type ConsultAgreement, type PublicCase } from '@/lib/teleconsult';

type LoadState = { kind: 'loading' } | { kind: 'expired' } | { kind: 'ready'; data: PublicCase };

const inp = 'w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#4F46E5]';

export default function PublicConsultPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [diagnosis, setDiagnosis] = useState('');
  const [agreement, setAgreement] = useState<ConsultAgreement | null>(null);
  const [response, setResponse] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/teleconsult/public/${token}`);
        if (!res.ok) { setState({ kind: 'expired' }); return; }
        setState({ kind: 'ready', data: await res.json() });
      } catch { setState({ kind: 'expired' }); }
    })();
  }, [token]);

  const submit = async () => {
    if (state.kind !== 'ready') return;
    setSubmitting(true); setError('');
    try {
      const res = await fetch(`/api/v1/teleconsult/${state.data.id}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, consultantResponse: response, consultantDiagnosis: diagnosis || undefined, agreementLevel: agreement || undefined }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch { setError('Could not submit your response. The link may have expired.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#F1F5F9] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Brand header */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#4F46E5] text-white"><FlaskConical size={18} /></span>
          <span className="text-[18px] font-bold tracking-tight text-[#0F172A]">CYTOLAB</span>
        </div>

        {state.kind === 'loading' && (
          <div className="grid h-40 place-items-center rounded-2xl border border-[#EEF2F7] bg-white"><Loader2 size={26} className="animate-spin text-[#94A3B8]" /></div>
        )}

        {state.kind === 'expired' && (
          <div className="rounded-2xl border border-[#EEF2F7] bg-white p-10 text-center shadow-sm">
            <AlertTriangle size={30} className="mx-auto text-[#B91C1C]" />
            <div className="mt-3 text-[18px] font-bold text-[#0F172A]">This consultation link has expired.</div>
            <div className="mt-1 text-[14px] text-[#6B7280]">Please contact the requesting laboratory for a new link.</div>
          </div>
        )}

        {state.kind === 'ready' && submitted && (
          <div className="rounded-2xl border border-[#EEF2F7] bg-white p-10 text-center shadow-sm">
            <CheckCircle2 size={30} className="mx-auto text-[#16A34A]" />
            <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Response submitted</div>
            <div className="mt-1 text-[14px] text-[#6B7280]">Thank you. The requesting laboratory has been notified.</div>
          </div>
        )}

        {state.kind === 'ready' && !submitted && (() => {
          const c = state.data;
          return (
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border border-[#EEF2F7] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-[#64748B]">Consultation request from</div>
                  <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: URGENCY_META[c.urgency].bg, color: URGENCY_META[c.urgency].fg }}>{URGENCY_META[c.urgency].label}</span>
                </div>
                <div className="text-[20px] font-bold text-[#0F172A]">{c.requestingLab}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#16A34A]"><ShieldCheck size={13} /> De-identified case · {c.caseReference}</div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#F1F5F9] pt-4 text-[13px]">
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Specimen</div><div className="mt-0.5 text-[#334155]">{c.specimenType}</div></div>
                  <div><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Due</div><div className="mt-0.5 text-[#334155]">{shortDate(c.dueDate)}</div></div>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Clinical Summary</div>
                  <p className="mt-1 text-[14px] text-[#334155]">{c.clinicalSummary}</p>
                </div>
                {c.bethesdaClassification && (
                  <div className="mt-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Existing Classification</div><div className="mt-0.5 text-[14px] font-semibold text-[#0F172A]">{c.bethesdaClassification}</div></div>
                )}
                {c.narrative && (
                  <div className="mt-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Narrative Report</div><p className="mt-1 whitespace-pre-wrap text-[14px] text-[#334155]">{c.narrative}</p></div>
                )}
                <div className="mt-3 rounded-xl bg-[#EEF2FF] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#4F46E5]">Specific Question</div>
                  <p className="mt-1 text-[14px] font-medium text-[#0F172A]">{c.specificQuestion}</p>
                </div>
              </div>

              {/* Response form */}
              <div className="rounded-2xl border border-[#EEF2F7] bg-white p-6 shadow-sm">
                <div className="text-[16px] font-bold text-[#0F172A]">Your Response</div>

                <div className="mt-4">
                  <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Diagnosis / Assessment</label>
                  <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={inp} placeholder="Your diagnostic impression (optional)" />
                </div>

                {c.bethesdaClassification && (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Agreement with existing classification ({c.bethesdaClassification})</label>
                    <div className="flex flex-col gap-2">
                      {([['FullAgreement', 'Full Agreement', '#16A34A'], ['PartialAgreement', 'Partial Agreement', 'var(--color-warning)'], ['Disagreement', 'Disagreement', '#DC2626']] as [ConsultAgreement, string, string][]).map(([val, label, color]) => (
                        <button key={val} onClick={() => setAgreement(val)} className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors"
                          style={agreement === val ? { borderColor: color, background: `${color}12`, color } : { borderColor: '#E2E8F0', color: '#334155' }}>
                          <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: agreement === val ? color : '#CBD5E1' }}>{agreement === val && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="mb-1 block text-[12px] font-semibold uppercase tracking-wide text-[#94A3B8]">Detailed Response</label>
                  <textarea rows={5} value={response} onChange={(e) => setResponse(e.target.value)} className={inp} placeholder="Your detailed assessment and recommendations…" />
                </div>

                {error && <div className="mt-3 rounded-lg bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#B91C1C]">{error}</div>}

                <button disabled={!response || submitting} onClick={submit} className="mt-4 w-full rounded-lg bg-[#4F46E5] px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40">
                  {submitting ? 'Submitting…' : 'Submit Response'}
                </button>
              </div>
              <div className="pb-6 text-center text-[12px] text-[#94A3B8]">This case has been de-identified. No patient name, date of birth, or identifying information is shared.</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
