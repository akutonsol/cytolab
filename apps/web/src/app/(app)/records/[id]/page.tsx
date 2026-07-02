'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, Download,
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
const OPEN = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
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

const btnPrimary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60';
const btnSecondary = 'flex w-full items-center justify-center gap-2 rounded-xl border border-[#4F46E5] px-4 py-2.5 text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF] disabled:opacity-60';
const LABEL = 'text-[10px] font-bold uppercase tracking-[0.08em] text-[#9CA3AF]';

// Floating-particle / glow configs for the cytology-image animation layers.
const PARTICLES = [
  { left: '15%', top: '20%', size: 8, color: 'rgba(129,140,248,0.6)', anim: 'drift1', delay: '0s', dur: '7s' },
  { left: '70%', top: '15%', size: 6, color: 'rgba(167,139,250,0.5)', anim: 'drift2', delay: '0.8s', dur: '9s' },
  { left: '40%', top: '62%', size: 10, color: 'rgba(196,181,253,0.4)', anim: 'drift3', delay: '1.6s', dur: '8s' },
  { left: '85%', top: '55%', size: 5, color: 'rgba(99,102,241,0.7)', anim: 'drift4', delay: '2.4s', dur: '10s' },
  { left: '25%', top: '78%', size: 7, color: 'rgba(129,140,248,0.6)', anim: 'drift5', delay: '3.2s', dur: '6s' },
  { left: '55%', top: '32%', size: 4, color: 'rgba(167,139,250,0.5)', anim: 'drift6', delay: '4s', dur: '9s' },
  { left: '10%', top: '48%', size: 9, color: 'rgba(196,181,253,0.4)', anim: 'drift7', delay: '4.8s', dur: '7s' },
  { left: '78%', top: '82%', size: 6, color: 'rgba(99,102,241,0.7)', anim: 'drift8', delay: '5.6s', dur: '8s' },
];
const GLOWS = [
  { left: '18%', top: '22%', size: 100, color: 'rgba(129,140,248,0.15)', delay: '0s', dur: '5s' },
  { left: '62%', top: '58%', size: 120, color: 'rgba(167,139,250,0.12)', delay: '1.5s', dur: '6s' },
  { left: '45%', top: '38%', size: 90, color: 'rgba(99,102,241,0.10)', delay: '3s', dur: '4s' },
];

const ANIM_CSS = `
@keyframes cytoBreathe{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.04);filter:brightness(1.05)}}
@keyframes glowPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}
@keyframes scanLine{0%{top:0%;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
@keyframes colorDrift{0%{background:rgba(99,102,241,0)}25%{background:rgba(99,102,241,.04)}50%{background:rgba(129,140,248,.06)}75%{background:rgba(167,139,250,.04)}100%{background:rgba(99,102,241,0)}}
@keyframes stepPulse{0%,100%{box-shadow:0 0 0 0 rgba(79,70,229,.4)}50%{box-shadow:0 0 0 8px rgba(79,70,229,0)}}
@keyframes drift1{0%{transform:translate(0,0) scale(1);opacity:.6}33%{transform:translate(12px,-18px) scale(1.2);opacity:.9}66%{transform:translate(-8px,10px) scale(.8);opacity:.4}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift2{0%{transform:translate(0,0) scale(1);opacity:.5}33%{transform:translate(-16px,12px) scale(1.3);opacity:.8}66%{transform:translate(10px,-14px) scale(.9);opacity:.3}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift3{0%{transform:translate(0,0) scale(1);opacity:.4}33%{transform:translate(18px,14px) scale(1.1);opacity:.7}66%{transform:translate(-12px,-16px) scale(.85);opacity:.3}100%{transform:translate(0,0) scale(1);opacity:.4}}
@keyframes drift4{0%{transform:translate(0,0) scale(1);opacity:.7}33%{transform:translate(-14px,-12px) scale(1.25);opacity:.95}66%{transform:translate(8px,16px) scale(.8);opacity:.45}100%{transform:translate(0,0) scale(1);opacity:.7}}
@keyframes drift5{0%{transform:translate(0,0) scale(1);opacity:.6}33%{transform:translate(10px,20px) scale(1.15);opacity:.85}66%{transform:translate(-16px,-8px) scale(.9);opacity:.4}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift6{0%{transform:translate(0,0) scale(1);opacity:.5}33%{transform:translate(-10px,-20px) scale(1.3);opacity:.8}66%{transform:translate(14px,8px) scale(.75);opacity:.3}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift7{0%{transform:translate(0,0) scale(1);opacity:.4}33%{transform:translate(16px,-10px) scale(1.2);opacity:.75}66%{transform:translate(-10px,14px) scale(.85);opacity:.35}100%{transform:translate(0,0) scale(1);opacity:.4}}
@keyframes drift8{0%{transform:translate(0,0) scale(1);opacity:.7}33%{transform:translate(-18px,10px) scale(1.1);opacity:.9}66%{transform:translate(12px,-12px) scale(.8);opacity:.4}100%{transform:translate(0,0) scale(1);opacity:.7}}
`;

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
  const [activeSpec, setActiveSpec] = useState(0);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [showAllActivity, setShowAllActivity] = useState(false);

  const notify = (type: 'ok' | 'err', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3200); };

  const { data: record, isLoading } = useQuery<any>({ queryKey: ['record-detail', id], queryFn: () => api.get(`/specimens/${id}`).then((r) => r.data), enabled: !!id });
  const { data: sheetsPage } = useQuery<Paginated<any>>({ queryKey: ['record-sheets', id], queryFn: () => api.get('/resultsheets', { params: { recordId: id } }).then((r) => r.data), enabled: !!id });
  const sheetId = sheetsPage?.data?.[0]?.id as string | undefined;
  const { data: sheet } = useQuery<any>({ queryKey: ['result-sheet', sheetId], queryFn: () => api.get(`/resultsheet/${sheetId}`).then((r) => r.data), enabled: !!sheetId });
  const { data: schema } = useQuery<any>({ queryKey: ['form-schema', record?.formType], queryFn: () => api.get(`/form-config/${record.formType}/schema`).then((r) => r.data), enabled: !!record?.formType });
  // Patient-level stats for the right panel.
  const { data: patientRecs } = useQuery<Paginated<any>>({ queryKey: ['patient-records', record?.patientId], enabled: !!record?.patientId, queryFn: () => api.get('/specimens/patient', { params: { patientId: record.patientId, pageSize: 100 } }).then((r) => r.data) });

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
      <div className="flex gap-5 p-6" style={{ background: '#F0F2F8', minHeight: 'calc(100vh - 140px)' }}>
        <div className="h-[70vh] w-[300px] shrink-0 animate-pulse rounded-[20px] bg-white/70" />
        <div className="h-[70vh] flex-1 animate-pulse rounded-[20px] bg-white/70" />
        <div className="h-[70vh] w-[300px] shrink-0 animate-pulse rounded-[20px] bg-white/70" />
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
  const fields = schema?.fields ?? [];
  const shownFields = showAllFeatures ? fields : fields.slice(0, 3);

  const specimens: any[] = record.specimens ?? [];
  const activeSpecimen = specimens[activeSpec] ?? specimens[0];
  const totalRecords = patientRecs?.total ?? patientRecs?.data?.length ?? 0;
  const openCases = (patientRecs?.data ?? []).filter((r: any) => OPEN.includes(r.status)).length || (OPEN.includes(status) ? 1 : 0);

  const abnormal = (sheet?.resultEntries ?? []).some((e: any) => (e.resultLines ?? []).some((l: any) => l.abnormalFinding));
  const aiFinding = sheet?.narrative ? (sheet.narrative.length > 120 ? `${sheet.narrative.slice(0, 120)}…` : sheet.narrative) : 'Awaiting cytological analysis.';
  const activity = [...(record.statusHistory ?? [])].reverse();
  const shownActivity = showAllActivity ? activity : activity.slice(0, 5);

  return (
    <div className="flex gap-5 p-6" style={{ background: '#F0F2F8', height: 'calc(100vh - 140px)', minHeight: 560 }}>
      <style>{ANIM_CSS}</style>

      {/* ═══════════ LEFT PANEL ═══════════ */}
      <aside className="premium-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-[20px] border border-[#EEF2F7] bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(79,70,229,0.06)' }}>
        <button onClick={() => router.back()} className="mb-4 flex items-center gap-1.5 self-start text-[12px] font-medium text-[#6B7280] hover:text-[#0F172A]"><ArrowLeft size={14} /> Records</button>

        {/* Identity */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[20px] font-bold text-[#0F172A]">{record.labNumber ?? '—'}</span>
            {record.formType && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{isGyn ? 'GYN' : 'NON-GYN'}</span>}
            {record.urgent && <span className="rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#DC2626]">URGENT</span>}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold" style={{ background: st.bg, color: st.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.fg }} />{status}</span>
        </div>
        <div className="mt-2 text-[14px] font-semibold text-[#6B7280]">{`${record.patient?.firstName ?? ''} ${record.patient?.lastName ?? ''}`.trim() || '—'}</div>
        <div className="text-[12px] text-[#9CA3AF]">{record.client?.officeName || `${record.client?.firstName ?? ''} ${record.client?.lastName ?? ''}`.trim() || '—'}</div>

        {/* Vertical stepper */}
        <div className="mt-6 flex flex-col">
          {STEPS.map((label, i) => {
            const done = i < currentStep; const current = i === currentStep; const passed = i <= currentStep;
            const circle = current && special ? { background: STATUS[status].bg, color: STATUS[status].fg }
              : passed ? { background: INDIGO, color: '#fff', animation: current && !special ? 'stepPulse 2s infinite' : undefined }
                : { background: '#F3F4F6', color: '#9CA3AF' };
            return (
              <div key={label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={circle as any}>
                    {current && special ? (status === 'OnHold' ? <Pause size={12} /> : <X size={12} />) : done ? <Check size={13} /> : <span>{i + 1}</span>}
                  </div>
                  {i < STEPS.length - 1 && <div className="w-0.5 flex-1" style={{ minHeight: 16, background: i < currentStep ? INDIGO : '#E5E7EB' }} />}
                </div>
                <div className="pb-3">
                  <div className="text-[13px] font-semibold" style={{ color: passed ? '#0F172A' : '#9CA3AF' }}>{label}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{current ? (special ? (status === 'OnHold' ? 'On Hold' : status === 'Failed' ? 'Failed' : 'Cancelled') : 'In progress') : done ? 'Done' : 'Upcoming'}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recommended action */}
        <div className="mt-3 border-t border-[#F3F4F6] pt-4">
          <div className={LABEL}>Recommended Action</div>
          <div className="mt-2"><ActionPanel status={status} pending={statusMut.isPending} go={go} onEditFeatures={() => setDrawer(true)} onOpenSheet={() => setSheetModal(true)} onAuthorize={() => setAuthModal(true)} onInvoice={() => router.push(`/billing?recordId=${id}`)} onReport={() => router.push(`/reports?recordId=${id}`)} onAuthorizer={() => router.push('/authorizer')} /></div>
        </div>

        {/* Clinical features (collapsible) */}
        <div className="mt-5 border-t border-[#F3F4F6] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className={LABEL}>Clinical Features</div>
            <button onClick={() => setDrawer(true)} className="grid h-7 w-7 place-items-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#4F46E5]"><Pencil size={13} /></button>
          </div>
          {!hasFeatures ? (
            <div className="text-[12px] text-[#9CA3AF]">No clinical features recorded.</div>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                {shownFields.map((f: any) => {
                  const v = featValue(f.fieldKey);
                  return (
                    <div key={f.fieldKey} className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#9CA3AF]">{f.label}</span>
                      <span className="text-right text-[13px] font-medium text-[#0F172A]">{f.fieldType === 'CHECKBOX' ? (v ? <Check size={14} className="inline text-[#16A34A]" /> : <span className="text-[#D1D5DB]">—</span>) : (v || <span className="text-[#D1D5DB]">—</span>)}</span>
                    </div>
                  );
                })}
              </div>
              {fields.length > 3 && <button onClick={() => setShowAllFeatures((v) => !v)} className="mt-3 text-[12px] font-semibold text-[#4F46E5] hover:underline">{showAllFeatures ? 'Show less' : `Show all (${fields.length})`}</button>}
            </>
          )}
        </div>
      </aside>

      {/* ═══════════ CENTER PANEL ═══════════ */}
      <section className="flex min-w-[400px] flex-1 flex-col overflow-hidden rounded-[20px] border border-[#EEF2F7] bg-white">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[#F3F4F6] px-5 py-4">
          <div className={LABEL}>Specimen Analysis</div>
          <div className="flex items-center gap-1.5 rounded-full bg-[#F3F4F6] p-1">
            {specimens.length === 0 ? <span className="px-3 py-1 text-[12px] text-[#9CA3AF]">No specimens</span> : specimens.map((s: any, i: number) => (
              <button key={s.id} onClick={() => setActiveSpec(i)} className="rounded-full px-3 py-1 text-[12px] font-semibold transition-colors" style={i === activeSpec ? { background: '#4F46E5', color: '#fff' } : { color: '#6B7280' }}>{specLabel(s.type)}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] font-semibold text-[#4F46E5]">{record.labNumber ?? '—'}</span>
            <span className="rounded-md bg-[#EEF3FF] px-2 py-0.5 text-[11px] font-bold text-[#4F46E5]">{openCases} Active</span>
          </div>
        </div>

        {/* Cytology image + animation layers */}
        <div className="relative flex-1 overflow-hidden bg-[#F5F0FA]">
          <div className="absolute inset-0" style={{ animation: 'cytoBreathe 8s ease-in-out infinite' }}>
            <Image src="/cytology-sample.png" alt="Cytology specimen" fill unoptimized sizes="60vw" style={{ objectFit: 'cover', objectPosition: 'center' }} priority />
          </div>
          {/* Layer 5 — colour drift */}
          <div className="pointer-events-none absolute inset-0" style={{ animation: 'colorDrift 12s linear infinite' }} />
          {/* Layer 3 — radial glow pulse */}
          {GLOWS.map((g, i) => (
            <div key={`g${i}`} className="pointer-events-none absolute rounded-full" style={{ left: g.left, top: g.top, width: g.size, height: g.size, background: g.color, filter: 'blur(30px)', animation: `glowPulse ${g.dur} ease-in-out ${g.delay} infinite` }} />
          ))}
          {/* Layer 2 — floating particles */}
          {PARTICLES.map((p, i) => (
            <div key={`p${i}`} className="pointer-events-none absolute rounded-full" style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: p.color, animation: `${p.anim} ${p.dur} ease-in-out ${p.delay} infinite` }} />
          ))}
          {/* Layer 4 — scan line */}
          <div className="pointer-events-none absolute left-0 right-0" style={{ height: 2, background: 'linear-gradient(to right, transparent, rgba(129,140,248,0.4), transparent)', animation: 'scanLine 4s linear infinite' }} />
        </div>

        {/* Bottom info bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#F3F4F6] bg-[#F8FAFC] px-5 py-4">
          <div className="min-w-0 flex-1 text-[13px] text-[#374151]">
            {abnormal && <span className="mr-1.5 font-bold text-[#4F46E5]">Attention ·</span>}
            {aiFinding}
          </div>
          {sheet ? (
            sheet.authorized
              ? <span className="inline-flex items-center gap-1 rounded-md bg-[#DCFCE7] px-2.5 py-1 text-[11px] font-bold text-[#16A34A]"><CheckCircle2 size={12} /> Authorized</span>
              : activeSpecimen && <span className="rounded-md bg-[#EEF3FF] px-2.5 py-1 text-[11px] font-bold text-[#4F46E5]">{specLabel(activeSpecimen.type)}</span>
          ) : activeSpecimen && <span className="rounded-md bg-[#EEF3FF] px-2.5 py-1 text-[11px] font-bold text-[#4F46E5]">{specLabel(activeSpecimen.type)}</span>}
          <button onClick={() => setSheetModal(true)} className="flex items-center gap-1 text-[13px] font-semibold text-[#4F46E5] hover:underline">{sheet ? 'View Result Sheet' : 'Add Result Sheet'} <ChevronRight size={14} /></button>
        </div>
      </section>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <aside className="premium-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-[20px] border border-[#EEF2F7] bg-white p-6" style={{ boxShadow: '0 4px 24px rgba(79,70,229,0.06)' }}>
        <div className={`${LABEL} mb-4`}>Patient Stats</div>
        <div className="flex flex-col gap-4">
          <Stat icon={Activity} label="Total Records" value={String(totalRecords)} unit="cases" />
          <Stat icon={FlaskConical} label="Open Cases" value={String(openCases)} unit="in progress" />
          <Stat icon={Clock} label="Avg TAT" value="—" unit="days" />
        </div>

        <div className="my-5 border-t border-[#F3F4F6]" />

        <div className={`${LABEL} mb-3`}>Activity Timeline</div>
        <div className="flex flex-col">
          {shownActivity.map((ev: any, i: number) => {
            const c = STATUS[ev.status] ?? STATUS.Pending;
            return (
              <div key={ev.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.fg }} />
                  {i < shownActivity.length - 1 && <span className="w-px flex-1 bg-[#E5E7EB]" />}
                </div>
                <div className="pb-3.5">
                  <div className="text-[13px] font-semibold text-[#0F172A]">{ev.status}</div>
                  <div className="text-[11px] text-[#9CA3AF]">{ev.user ? `${ev.user.firstName ?? ''} ${ev.user.lastName ?? ''}`.trim() : 'System'} · {relTime(ev.createdAt)}</div>
                </div>
              </div>
            );
          })}
          {activity.length === 0 && <div className="text-[12px] text-[#9CA3AF]">No activity yet.</div>}
          {activity.length > 5 && <button onClick={() => setShowAllActivity((v) => !v)} className="text-[12px] font-semibold text-[#4F46E5] hover:underline">{showAllActivity ? 'Show less' : `Show more (${activity.length})`}</button>}
        </div>

        <div className="my-5 border-t border-[#F3F4F6]" />

        <div className={`${LABEL} mb-3`}>Result Sheet</div>
        {!sheet ? (
          <div className="flex flex-col items-start gap-2">
            <div className="text-[12px] text-[#9CA3AF]">No result sheet.</div>
            <button onClick={() => setSheetModal(true)} className={btnSecondary}>Add Result Sheet</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold" style={sheet.authorized ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#EEF3FF', color: '#4F46E5' }}>{sheet.authorized ? <CheckCircle2 size={12} /> : <Clock size={12} />}{sheet.authorized ? 'Authorized' : 'Pending'}</span>
            {sheet.narrative && (
              <div className="text-[12px] leading-relaxed text-[#374151]">
                {showFullNarrative || sheet.narrative.length <= 100 ? sheet.narrative : `${sheet.narrative.slice(0, 100)}…`}
                {sheet.narrative.length > 100 && <button onClick={() => setShowFullNarrative((v) => !v)} className="ml-1 font-semibold text-[#4F46E5]">{showFullNarrative ? 'less' : 'Read more'}</button>}
              </div>
            )}
            {(sheet.resultEntries ?? []).flatMap((e: any) => (e.resultLines ?? []).filter((l: any) => l.abnormalFinding)).map((l: any) => (
              <span key={l.id} className="inline-flex w-fit items-center gap-1 rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-semibold text-[#DC2626]"><AlertTriangle size={11} /> {l.abbreviation}</span>
            ))}
          </div>
        )}

        <div className="my-5 border-t border-[#F3F4F6]" />

        <div className={`${LABEL} mb-3`}>Next Steps</div>
        <div className="flex flex-col gap-2">
          {status === 'Resulted' && <button onClick={() => router.push('/authorizer')} className={btnSecondary}>Open Authorizer</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={btnSecondary}>Release Report</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/billing?recordId=${id}`)} className={btnSecondary}>Create Invoice</button>}
          {['Billed', 'Paid', 'Viewed'].includes(status) && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={btnSecondary}>View Report</button>}
          <button onClick={() => router.push('/records')} className={btnSecondary}>Back to Records</button>
        </div>
      </aside>

      {/* Modals (unchanged) */}
      {record.formType && <RecordFormDrawer open={drawer} onClose={() => { setDrawer(false); refetchAll(); }} formType={record.formType as FormType} recordId={id} />}
      <ResultSheetModal open={sheetModal} onClose={() => { setSheetModal(false); refetchAll(); }} record={record} />
      <AuthorizationModal open={authModal} onClose={() => { setAuthModal(false); refetchAll(); }} record={record} />

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

      {toast && <div className="fixed bottom-6 right-6 z-[110] rounded-xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg" style={{ background: toast.type === 'ok' ? '#16A34A' : '#DC2626' }}>{toast.msg}</div>}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value, unit }: { icon: any; label: string; value: string; unit: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#F0F0FF] text-[#4F46E5]"><Icon size={18} /></span>
      <div>
        <div className="text-[11px] text-[#9CA3AF]">{label}</div>
        <div className="flex items-baseline gap-1.5"><span className="text-[22px] font-bold leading-none text-[#0F172A]">{value}</span><span className="text-[12px] text-[#6B7280]">{unit}</span></div>
      </div>
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
  const Title = ({ children }: any) => <div className="text-[15px] font-bold text-[#0F172A]">{children}</div>;
  const Desc = ({ children }: any) => <div className="mt-1 text-[12px] leading-relaxed text-[#6B7280]">{children}</div>;
  const Row = ({ children }: any) => <div className="mt-3 flex flex-col gap-2">{children}</div>;

  switch (status) {
    case 'Pending':
      return (<><Title>Ready to Submit</Title><Desc>Review clinical features and submit this record for processing.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Submitted', { title: 'Submit for processing?', desc: 'This moves the record into the processing queue.' })}>Submit for Processing <ChevronRight size={15} /></button>
          <button className={btnSecondary} onClick={p.onEditFeatures}>Edit Clinical Features</button>
        </Row></>);
    case 'Submitted':
      return (<><Title>Awaiting Processing</Title><Desc>Mark this record as in processing when the specimen is received in lab.</Desc>
        <Row>
          <button disabled={pending} className={btnPrimary} onClick={() => go('Processing')}>Mark as Processing <ChevronRight size={15} /></button>
          <button disabled={pending} className={btnSecondary} onClick={() => go('OnHold')}>Put On Hold</button>
        </Row></>);
    case 'Processing':
    case 'Partial':
      return (<><Title>Add Result Sheet</Title><Desc>Enter cytology findings for this specimen.</Desc>
        <Row>
          <button className={btnPrimary} onClick={p.onOpenSheet}>Open Result Sheet <ChevronRight size={15} /></button>
          {status === 'Processing' && <button disabled={pending} className={btnSecondary} onClick={() => go('Partial')}>Mark Partial</button>}
          <button disabled={pending} className={btnSecondary} onClick={() => go('Completed', { title: 'Mark complete?', desc: 'Confirm the result sheet is complete for this record.' })}>Mark Complete</button>
        </Row></>);
    case 'Completed':
      return (<><Title>Ready for Review</Title><Desc>Result sheet is complete. Submit for pathologist authorization.</Desc>
        <Row><button disabled={pending} className={btnPrimary} onClick={() => go('Resulted', { title: 'Submit for authorization?', desc: 'This places the record in the pathologist authorization queue.' })}>Submit for Authorization <ChevronRight size={15} /></button></Row></>);
    case 'Resulted':
      return (<><Title>Awaiting Authorization</Title><Desc>This record is in the authorization queue.</Desc>
        <Row><button className={btnPrimary} onClick={p.onAuthorize}>Authorize Now <ChevronRight size={15} /></button>
          <button onClick={p.onAuthorizer} className={btnSecondary}>Batch Authorizer</button></Row></>);
    case 'Approved':
      return (<><CheckHero /><Title>Approved — Ready to Bill</Title><Desc>Record is authorized. Generate an invoice for the referring client.</Desc>
        <Row><button className={btnPrimary} onClick={p.onInvoice}>Create Invoice <ChevronRight size={15} /></button>
          <button className={btnSecondary} onClick={p.onReport}><Download size={14} /> Download Report</button></Row></>);
    case 'Billed':
    case 'Paid':
      return (<><CheckHero /><Title>Billing Complete</Title><Desc>This record has been billed{status === 'Paid' ? ' and paid' : ''}.</Desc>
        <Row><button className={btnSecondary} onClick={p.onReport}><Download size={14} /> Download Report</button></Row></>);
    case 'OnHold':
      return (<><div className="mb-3 flex items-center gap-2 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-3 py-2 text-[13px] font-semibold text-[#475569]"><Pause size={15} /> On hold.</div>
        <Title>Record On Hold</Title><Desc>Resume processing or cancel this record.</Desc>
        <Row><button disabled={pending} className={btnPrimary} onClick={() => go('Submitted')}>Resume Processing <ChevronRight size={15} /></button>
          <button disabled={pending} className={btnSecondary} onClick={() => go('Disabled', { title: 'Cancel record?', desc: 'This marks the record as cancelled.' })}>Cancel Record</button></Row></>);
    case 'Failed':
    case 'Disabled':
      return (<><div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold" style={status === 'Failed' ? { background: '#FEF2F2', color: '#DC2626' } : { background: '#F3F4F6', color: '#6B7280' }}><X size={15} /> {status === 'Failed' ? 'Failed' : 'Cancelled'}.</div>
        <Title>Record {status === 'Failed' ? 'Failed' : 'Cancelled'}</Title><Desc>Reopen this record to move it back into processing.</Desc>
        <Row><button disabled={pending} className={btnPrimary} onClick={() => go('Submitted', { title: 'Reopen record?', desc: 'This returns the record to the processing workflow.' })}>Reopen Record <ChevronRight size={15} /></button></Row></>);
    default:
      return (<><Title>Complete</Title><Desc>This record has completed its lifecycle.</Desc></>);
  }
}

function CheckHero() {
  return <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#DCFCE7]"><CheckCircle2 size={22} className="text-[#16A34A]" /></div>;
}
