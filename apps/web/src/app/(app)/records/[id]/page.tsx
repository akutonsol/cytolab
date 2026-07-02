'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Download, FileText,
  FlaskConical, Pause, Pencil, X,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import { ResultSheetModal } from '@/components/ResultSheetModal';
import { AuthorizationModal } from '@/components/AuthorizationModal';
import { SPECIMEN_LABELS, type FormType } from '@/lib/specimen-types';

// ─── Status + step maps (zero-orange) ────────────────────────────────────────
const STATUS: Record<string, { bg: string; fg: string }> = {
  Pending: { bg: '#F3F4F6', fg: '#6B7280' },
  Submitted: { bg: '#ECFEFF', fg: '#0891B2' },
  Processing: { bg: '#EFF6FF', fg: '#2563EB' },
  Partial: { bg: '#EEF3FF', fg: '#4F46E5' },
  Completed: { bg: '#F0FDF4', fg: '#16A34A' },
  Resulted: { bg: '#F5F3FF', fg: '#6D28D9' },
  Approved: { bg: '#DCFCE7', fg: '#16A34A' },
  Billed: { bg: '#F5F3FF', fg: '#7C3AED' },
  Paid: { bg: '#DCFCE7', fg: '#15803D' },
  OnHold: { bg: '#F1F5F9', fg: '#64748B' },
  Disabled: { bg: '#F3F4F6', fg: '#6B7280' },
  Failed: { bg: '#FEF2F2', fg: '#DC2626' },
  Viewed: { bg: '#F0FDFA', fg: '#0D9488' },
};
const STEPS = ['Intake', 'Processing', 'Results', 'Authorization', 'Billing', 'Complete'];
const STEP_OF: Record<string, number> = {
  Pending: 0, Submitted: 0, Processing: 1, Partial: 1, Completed: 2, Resulted: 2,
  Approved: 3, Billed: 4, Paid: 5, Viewed: 5,
};
const SPECIAL = ['OnHold', 'Failed', 'Disabled'];
const INDIGO = '#4F46E5';

const specLabel = (t?: string) => (t ? (SPECIMEN_LABELS as any)[t] ?? t : '—');
const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const relTime = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};
const initials = (f?: string, l?: string) => `${(f ?? '')[0] ?? ''}${(l ?? '')[0] ?? ''}`.toUpperCase() || '—';

const CARD = 'rounded-[20px] border border-[#EEF2F7] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)]';
const btnPrimary = 'flex items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60';
const btnSecondary = 'flex items-center justify-center gap-2 rounded-xl border border-[#4F46E5] px-5 py-3 text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF] disabled:opacity-60';

// ─── Page ────────────────────────────────────────────────────────────────────
export default function RecordDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const id = String(useParams().id);

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; run: () => void } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [sheetModal, setSheetModal] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [showFullNarrative, setShowFullNarrative] = useState(false);

  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: record, isLoading } = useQuery<any>({ queryKey: ['record-detail', id], queryFn: () => api.get(`/specimens/${id}`).then((r) => r.data), enabled: !!id });
  const { data: sheetsPage } = useQuery<Paginated<any>>({ queryKey: ['record-sheets', id], queryFn: () => api.get('/resultsheets', { params: { recordId: id } }).then((r) => r.data), enabled: !!id });
  const sheetId = sheetsPage?.data?.[0]?.id as string | undefined;
  const { data: sheet } = useQuery<any>({ queryKey: ['result-sheet', sheetId], queryFn: () => api.get(`/resultsheet/${sheetId}`).then((r) => r.data), enabled: !!sheetId });
  const { data: schema } = useQuery<any>({ queryKey: ['form-schema', record?.formType], queryFn: () => api.get(`/form-config/${record.formType}/schema`).then((r) => r.data), enabled: !!record?.formType });

  const refetchAll = () => { qc.invalidateQueries({ queryKey: ['record-detail', id] }); qc.invalidateQueries({ queryKey: ['record-sheets', id] }); };

  const statusMut = useMutation({
    mutationFn: (v: { status: string; notes?: string }) => api.patch(`/specimen/status/${id}`, v).then((r) => r.data),
    onSuccess: (_d, v) => { notify('ok', `Status updated to ${v.status}`); refetchAll(); },
    onError: (e: any) => notify('err', e?.response?.data?.message ?? 'Could not update status'),
  });
  const go = (status: string, c?: { title: string; desc: string }) => {
    if (c) setConfirm({ title: c.title, desc: c.desc, run: () => { setConfirm(null); statusMut.mutate({ status }); } });
    else statusMut.mutate({ status });
  };

  const currentStep = useMemo(() => {
    if (!record) return 0;
    if (record.status in STEP_OF) return STEP_OF[record.status];
    const steps = (record.statusHistory ?? []).map((h: any) => STEP_OF[h.status]).filter((n: number) => n !== undefined);
    return steps.length ? Math.max(...steps) : 0;
  }, [record]);

  if (isLoading || !record) {
    return (
      <div className="min-h-full px-6 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
        <div className="animate-pulse space-y-5 pt-4">
          <div className="h-32 rounded-[20px] bg-[#EEF2F7]" />
          <div className="h-28 rounded-[20px] bg-[#EEF2F7]" />
          <div className="h-40 rounded-[20px] bg-[#EEF2F7]" />
        </div>
      </div>
    );
  }

  const status = record.status as string;
  const isGyn = record.formType === 'Gynecology';
  const feat = isGyn ? record.gynFeatures : record.nonGynFeatures;
  const special = SPECIAL.includes(status);
  const st = STATUS[status] ?? STATUS.Pending;

  const featValue = (key: string) => {
    if (key === 'registrationNo') return record.patient?.registrationNo ?? null;
    if (key === 'clinicalDiagnosis') return record.clinicalDiagnosis ?? null;
    return feat ? feat[key] : null;
  };
  const hasFeatures = !!feat || !!record.clinicalDiagnosis;

  return (
    <div className="min-h-full px-6 pb-10 pt-4 lg:px-9" style={{ background: '#F8FAFC' }}>
      <style>{`@keyframes recpulse{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,0.4)}50%{box-shadow:0 0 0 8px rgba(79,70,229,0)}}`}</style>

      {/* Breadcrumb */}
      <button onClick={() => router.back()} className="mb-5 flex items-center gap-2 text-[14px] font-medium text-[#6B7280] hover:text-[#0F172A]">
        <ArrowLeft size={16} /> Records <span className="text-[#D1D5DB]">/</span> <span className="font-mono font-semibold text-[#0F172A]">{record.labNumber ?? '—'}</span>
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.85fr_1fr]">
        {/* ═══ LEFT ═══ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Header card */}
          <div className={`${CARD} p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[22px] font-bold text-[#0F172A]">{record.labNumber ?? '—'}</span>
                {record.formType && (
                  <span className="rounded-md px-2.5 py-1 text-[12px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>
                    {isGyn ? 'GYN' : 'NON-GYN'}
                  </span>
                )}
                {record.urgent && <span className="rounded-md bg-[#FEF2F2] px-2.5 py-1 text-[12px] font-bold text-[#DC2626]">URGENT</span>}
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[14px] font-bold" style={{ background: st.bg, color: st.fg }}>
                <span className="h-2 w-2 rounded-full" style={{ background: st.fg }} />{status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <Info label="Patient" value={`${record.patient?.firstName ?? ''} ${record.patient?.lastName ?? ''}`.trim() || '—'} sub={record.patient?.registrationNo} />
              <Info label="Client" value={record.client?.officeName || `${record.client?.firstName ?? ''} ${record.client?.lastName ?? ''}`.trim() || '—'} sub={record.client?.accountNo} />
              <Info label="Received" value={dateFmt(record.specimenDate)} sub={relTime(record.createdAt)} />
            </div>

            <div className="mt-4 border-t border-[#F3F4F6] pt-4">
              <div className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">Specimens</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(record.specimens ?? []).length === 0 ? <span className="text-[13px] text-[#9CA3AF]">None</span>
                  : record.specimens.map((s: any) => <span key={s.id} className="rounded-md bg-[#F3F4F6] px-2.5 py-1 text-[12px] font-semibold text-[#374151]">{specLabel(s.type)}</span>)}
              </div>
            </div>
          </div>

          {/* Stepper */}
          <div className={`${CARD} p-6`}>
            <div className="flex items-start">
              {STEPS.map((label, i) => {
                const done = i < currentStep;
                const current = i === currentStep;
                const passed = i <= currentStep;
                return (
                  <div key={label} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-center">
                      <div className="h-0.5 flex-1" style={{ background: i === 0 ? 'transparent' : (i <= currentStep ? INDIGO : '#E5E7EB') }} />
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold"
                        style={current && special
                          ? { background: STATUS[status].bg, color: STATUS[status].fg }
                          : passed ? { background: INDIGO, color: '#fff', animation: current && !special ? 'recpulse 2s infinite' : undefined }
                            : { background: '#F3F4F6', color: '#9CA3AF' }}>
                        {current && special ? (status === 'OnHold' ? <Pause size={15} /> : <X size={15} />)
                          : done ? <Check size={16} />
                            : <span>{i + 1}</span>}
                      </div>
                      <div className="h-0.5 flex-1" style={{ background: i === STEPS.length - 1 ? 'transparent' : (i < currentStep ? INDIGO : '#E5E7EB') }} />
                    </div>
                    <span className="mt-2 text-center text-[12px] font-semibold" style={{ color: passed ? '#0F172A' : '#9CA3AF' }}>{label}</span>
                    {current && special && (
                      <span className="mt-1 rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ background: STATUS[status].bg, color: STATUS[status].fg }}>
                        {status === 'OnHold' ? 'On Hold' : status === 'Failed' ? 'Failed' : 'Cancelled'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action panel */}
          <div className={`${CARD} p-6`}>
            <ActionPanel
              status={status}
              pending={statusMut.isPending}
              go={go}
              onEditFeatures={() => setDrawer(true)}
              onOpenSheet={() => setSheetModal(true)}
              onAuthorize={() => setAuthModal(true)}
              onInvoice={() => router.push(`/billing?recordId=${id}`)}
              onReport={() => router.push(`/reports?recordId=${id}`)}
              onAuthorizer={() => router.push('/authorizer')}
            />
          </div>
        </div>

        {/* ═══ RIGHT ═══ */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* Clinical features */}
          <div className={`${CARD} p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-[#0F172A]">Clinical Features</h2>
              <button onClick={() => setDrawer(true)} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#4F46E5]"><Pencil size={15} /></button>
            </div>
            {!hasFeatures ? (
              <div className="py-6 text-center">
                <div className="text-[13px] text-[#9CA3AF]">No clinical features recorded</div>
                <button onClick={() => setDrawer(true)} className={`${btnSecondary} mx-auto mt-3`}>Add Clinical Features</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(schema?.fields ?? []).map((f: any) => {
                  const v = featValue(f.fieldKey);
                  return (
                    <div key={f.fieldKey} className="flex items-start justify-between gap-3 border-b border-[#F9FAFB] pb-3 last:border-b-0 last:pb-0">
                      <span className="text-[12px] text-[#9CA3AF]">{f.label}</span>
                      <span className="text-right text-[13px] font-medium text-[#0F172A]">
                        {f.fieldType === 'CHECKBOX' ? (v ? <Check size={15} className="inline text-[#16A34A]" /> : '—') : (v || <span className="text-[#D1D5DB]">—</span>)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Result sheet */}
          <div className={`${CARD} p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-bold text-[#0F172A]">Result Sheet</h2>
              {sheet && <button onClick={() => setSheetModal(true)} className="grid h-8 w-8 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#4F46E5]"><Pencil size={15} /></button>}
            </div>
            {!sheet ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <FlaskConical size={26} className="text-[#D1D5DB]" />
                <div className="text-[13px] text-[#9CA3AF]">No result sheet yet</div>
                <button onClick={() => setSheetModal(true)} className={btnSecondary}>Add Result Sheet</button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-bold" style={sheet.authorized ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#EEF3FF', color: '#4F46E5' }}>
                  {sheet.authorized ? <CheckCircle2 size={13} /> : <Clock size={13} />}{sheet.authorized ? 'Authorized' : 'Pending Authorization'}
                </span>
                {sheet.narrative && (
                  <div className="text-[13px] leading-relaxed text-[#374151]">
                    {showFullNarrative || sheet.narrative.length <= 200 ? sheet.narrative : `${sheet.narrative.slice(0, 200)}…`}
                    {sheet.narrative.length > 200 && (
                      <button onClick={() => setShowFullNarrative((v) => !v)} className="ml-1 text-[13px] font-semibold text-[#4F46E5]">{showFullNarrative ? 'Show less' : 'Show more'}</button>
                    )}
                  </div>
                )}
                {(sheet.resultEntries ?? []).map((e: any) => {
                  const spec = record.specimens?.find((s: any) => s.id === e.specimenId);
                  return (
                    <div key={e.id} className="rounded-xl border border-[#F1F3F7] p-3">
                      <div className="mb-2 text-[12px] font-semibold text-[#6B7280]">{specLabel(spec?.type)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(e.resultLines ?? []).map((l: any) => (
                          <span key={l.id} className="inline-flex items-center gap-1 rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-medium text-[#374151]">
                            {l.abnormalFinding && <AlertTriangle size={11} className="text-[#DC2626]" />}
                            <span className="font-semibold">{l.abbreviation}</span>{l.result ? <span className="text-[#9CA3AF]">· {l.result}</span> : null}
                          </span>
                        ))}
                      </div>
                      {(e.resultLines ?? []).some((l: any) => l.findings) && (
                        <div className="mt-2 text-[12px] text-[#6B7280]">{e.resultLines.filter((l: any) => l.findings).map((l: any) => l.findings).join(' · ')}</div>
                      )}
                    </div>
                  );
                })}
                {sheet.authorized && sheet.authorizedBy && (
                  <div className="flex items-center gap-2.5 border-t border-[#F3F4F6] pt-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-[#EEF3FF] text-[11px] font-bold text-[#4F46E5]">{initials(sheet.authorizedBy.firstName, sheet.authorizedBy.lastName)}</span>
                    <div>
                      <div className="text-[12px] font-semibold text-[#0F172A]">{`${sheet.authorizedBy.firstName ?? ''} ${sheet.authorizedBy.lastName ?? ''}`.trim() || sheet.authorizedBy.email}</div>
                      <div className="text-[11px] text-[#9CA3AF]">Authorized {dateFmt(sheet.authorizedAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className={`${CARD} p-6`}>
            <h2 className="mb-4 text-[16px] font-bold text-[#0F172A]">Activity</h2>
            <div className="flex flex-col">
              {[...(record.statusHistory ?? [])].reverse().map((ev: any, i: number, arr: any[]) => {
                const c = STATUS[ev.status] ?? STATUS.Pending;
                return (
                  <div key={ev.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.fg }} />
                      {i < arr.length - 1 && <span className="w-px flex-1 bg-[#E5E7EB]" />}
                    </div>
                    <div className="pb-4">
                      <div className="text-[13px] font-semibold text-[#0F172A]">{ev.status}</div>
                      <div className="text-[12px] text-[#9CA3AF]">
                        {ev.user ? `${ev.user.firstName ?? ''} ${ev.user.lastName ?? ''}`.trim() : 'System'} · {relTime(ev.createdAt)}
                      </div>
                      {ev.notes && <div className="mt-0.5 text-[12px] text-[#6B7280]">{ev.notes}</div>}
                    </div>
                  </div>
                );
              })}
              {(record.statusHistory ?? []).length === 0 && <div className="text-[13px] text-[#9CA3AF]">No activity yet</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {record.formType && <RecordFormDrawer open={drawer} onClose={() => { setDrawer(false); refetchAll(); }} formType={record.formType as FormType} recordId={id} />}
      <ResultSheetModal open={sheetModal} onClose={() => { setSheetModal(false); refetchAll(); }} record={record} />
      <AuthorizationModal open={authModal} onClose={() => { setAuthModal(false); refetchAll(); }} record={record} />

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-[18px] font-bold text-[#0F172A]">{confirm.title}</div>
            <div className="mt-1.5 text-[14px] text-[#6B7280]">{confirm.desc}</div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button onClick={() => setConfirm(null)} className="h-10 rounded-lg border border-[#E5E7EB] px-4 text-[14px] font-semibold text-[#6B7280] hover:text-[#0F172A]">Cancel</button>
              <button onClick={confirm.run} className="h-10 rounded-lg bg-[#4F46E5] px-5 text-[14px] font-semibold text-white hover:bg-[#4338CA]">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Info({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div>
      <div className="text-[12px] font-medium uppercase tracking-wide text-[#9CA3AF]">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-[#0F172A]">{value}</div>
      {sub && <div className="text-[12px] text-[#9CA3AF]">{sub}</div>}
    </div>
  );
}

interface ActionProps {
  status: string; pending: boolean;
  go: (status: string, confirm?: { title: string; desc: string }) => void;
  onEditFeatures: () => void; onOpenSheet: () => void; onAuthorize: () => void;
  onInvoice: () => void; onReport: () => void; onAuthorizer: () => void;
}
function ActionPanel(p: ActionProps) {
  const { status, pending, go } = p;
  const Title = ({ children }: any) => <div className="text-[18px] font-bold text-[#0F172A]">{children}</div>;
  const Desc = ({ children }: any) => <div className="mt-1 text-[14px] text-[#6B7280]">{children}</div>;
  const Row = ({ children }: any) => <div className="mt-4 flex flex-wrap gap-3">{children}</div>;

  switch (status) {
    case 'Pending':
      return (<><Title>Ready to Submit</Title><Desc>Review clinical features and submit this record for processing.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Submitted', { title: 'Submit for processing?', desc: 'This moves the record into the processing queue.' })}>Submit for Processing</button>
          <button className={btnSecondary} onClick={p.onEditFeatures}>Edit Clinical Features</button>
        </Row></>);
    case 'Submitted':
      return (<><Title>Awaiting Processing</Title><Desc>Mark this record as in processing when the specimen is received in lab.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Processing')}>Mark as Processing</button>
          <button disabled={pending} className={btnSecondary} onClick={() => go('OnHold')}>Put On Hold</button>
        </Row></>);
    case 'Processing':
    case 'Partial':
      return (<><Title>Add Result Sheet</Title><Desc>Enter cytology findings for this specimen.</Desc>
        <Row>
          <button className={btnPrimary} onClick={p.onOpenSheet}>Open Result Sheet</button>
          {status === 'Processing' && <button disabled={pending} className={btnSecondary} onClick={() => go('Partial')}>Mark Partial</button>}
          <button disabled={pending} className={btnSecondary} onClick={() => go('Completed', { title: 'Mark complete?', desc: 'Confirm the result sheet is complete for this record.' })}>Mark Complete</button>
        </Row></>);
    case 'Completed':
      return (<><Title>Ready for Review</Title><Desc>Result sheet is complete. Submit for pathologist authorization.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Resulted', { title: 'Submit for authorization?', desc: 'This places the record in the pathologist authorization queue.' })}>Submit for Authorization</button>
        </Row></>);
    case 'Resulted':
      return (<><Title>Awaiting Authorization</Title><Desc>This record is in the authorization queue.</Desc>
        <Row>
          <button className={btnPrimary} onClick={p.onAuthorize}>Authorize Now</button>
        </Row>
        <button onClick={p.onAuthorizer} className="mt-3 text-[13px] font-medium text-[#4F46E5] hover:underline">Or visit the Authorizer workspace for batch authorization →</button></>);
    case 'Approved':
      return (<><CheckHero /><Title>Approved — Ready to Bill</Title><Desc>Record is authorized. Generate an invoice for the referring client.</Desc>
        <Row>
          <button className={btnPrimary} onClick={p.onInvoice}>Create Invoice</button>
          <button className={btnSecondary} onClick={p.onReport}><Download size={15} /> Download Report</button>
        </Row></>);
    case 'Billed':
    case 'Paid':
      return (<><CheckHero /><Title>Billing Complete</Title><Desc>This record has been billed{status === 'Paid' ? ' and paid' : ''}.</Desc>
        <Row>
          <button className={btnSecondary} onClick={p.onReport}><Download size={15} /> Download Report</button>
        </Row></>);
    case 'OnHold':
      return (<><div className="mb-4 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-4 py-3 text-[14px] font-semibold text-[#475569]"><Pause size={16} /> This record is on hold.</div>
        <Title>Record On Hold</Title><Desc>Resume processing to return this record to the workflow, or cancel it.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Submitted')}>Resume Processing</button>
          <button disabled={pending} className={btnSecondary} onClick={() => go('Disabled', { title: 'Cancel record?', desc: 'This marks the record as cancelled.' })}>Cancel Record</button>
        </Row></>);
    case 'Failed':
    case 'Disabled':
      return (<><div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold" style={status === 'Failed' ? { background: '#FEF2F2', color: '#DC2626' } : { background: '#F3F4F6', color: '#6B7280' }}><X size={16} /> This record was {status === 'Failed' ? 'failed' : 'cancelled'}.</div>
        <Title>Record {status === 'Failed' ? 'Failed' : 'Cancelled'}</Title><Desc>Reopen this record to move it back into processing.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Submitted', { title: 'Reopen record?', desc: 'This returns the record to the processing workflow.' })}>Reopen Record</button>
        </Row></>);
    default:
      return (<><Title>Complete</Title><Desc>This record has completed its lifecycle.</Desc></>);
  }
}

function CheckHero() {
  return (
    <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#DCFCE7]"><CheckCircle2 size={26} className="text-[#16A34A]" /></div>
  );
}
