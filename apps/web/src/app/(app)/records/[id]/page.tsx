'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, Download,
  FlaskConical, Info, Microscope, Pause, Pencil, X,
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
// Activity-dot colour per the reference spec.
const DOT: Record<string, string> = {
  Pending: '#94A3B8', Submitted: '#94A3B8', Processing: '#4F46E5', Partial: '#4F46E5',
  Completed: '#22C55E', Resulted: '#4F46E5', Approved: '#22C55E', Billed: '#22C55E',
  Paid: '#22C55E', Failed: '#EF4444', Disabled: '#EF4444', OnHold: '#94A3B8', Viewed: '#22C55E',
};

const specLabel = (t?: string) => (t ? (SPECIMEN_LABELS as any)[t] ?? t : '—');
const relTime = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
};

// Button styles.
const actionPrimary = 'flex w-full items-center justify-between gap-2 rounded-full bg-[#4F46E5] px-5 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60';
const actionSecondary = 'flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#CBD5E1] px-5 py-[11px] text-[14px] font-semibold text-[#475569] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60';
const rightBtn = 'w-full rounded-[10px] bg-[#F1F5F9] px-3 py-2.5 text-center text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#E2E8F0]';
const LABEL = 'text-[10px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]';

// Floating-particle / glow configs — drifting "cells" over the specimen.
const PARTICLES = [
  { left: '14%', top: '22%', size: 16, color: 'rgba(129,140,248,0.55)', anim: 'drift1', delay: '0s', dur: '9s', blur: 1 },
  { left: '72%', top: '16%', size: 12, color: 'rgba(167,139,250,0.5)', anim: 'drift2', delay: '0.7s', dur: '11s', blur: 0 },
  { left: '40%', top: '60%', size: 24, color: 'rgba(196,181,253,0.4)', anim: 'drift3', delay: '1.4s', dur: '12s', blur: 2 },
  { left: '84%', top: '54%', size: 10, color: 'rgba(99,102,241,0.65)', anim: 'drift4', delay: '2.1s', dur: '10s', blur: 0 },
  { left: '24%', top: '78%', size: 14, color: 'rgba(129,140,248,0.55)', anim: 'drift5', delay: '2.8s', dur: '9s', blur: 1 },
  { left: '55%', top: '30%', size: 8, color: 'rgba(167,139,250,0.6)', anim: 'drift6', delay: '3.5s', dur: '11s', blur: 0 },
  { left: '10%', top: '48%', size: 20, color: 'rgba(196,181,253,0.4)', anim: 'drift7', delay: '4.2s', dur: '10s', blur: 2 },
  { left: '78%', top: '82%', size: 11, color: 'rgba(99,102,241,0.6)', anim: 'drift8', delay: '4.9s', dur: '12s', blur: 0 },
  { left: '34%', top: '38%', size: 9, color: 'rgba(129,140,248,0.55)', anim: 'drift2', delay: '1.1s', dur: '10s', blur: 0 },
  { left: '62%', top: '70%', size: 13, color: 'rgba(167,139,250,0.45)', anim: 'drift5', delay: '2.4s', dur: '11s', blur: 1 },
  { left: '88%', top: '32%', size: 15, color: 'rgba(196,181,253,0.45)', anim: 'drift3', delay: '3.2s', dur: '9s', blur: 1 },
  { left: '18%', top: '64%', size: 10, color: 'rgba(99,102,241,0.6)', anim: 'drift7', delay: '4.6s', dur: '12s', blur: 0 },
  { left: '48%', top: '16%', size: 8, color: 'rgba(129,140,248,0.5)', anim: 'drift4', delay: '2.6s', dur: '10s', blur: 0 },
  { left: '68%', top: '46%', size: 22, color: 'rgba(167,139,250,0.35)', anim: 'drift6', delay: '3.9s', dur: '13s', blur: 2 },
  { left: '30%', top: '52%', size: 7, color: 'rgba(99,102,241,0.7)', anim: 'drift1', delay: '1.8s', dur: '8s', blur: 0 },
  { left: '52%', top: '85%', size: 12, color: 'rgba(129,140,248,0.5)', anim: 'drift8', delay: '5.4s', dur: '11s', blur: 1 },
];
const GLOWS = [
  { left: '18%', top: '22%', size: 100, color: 'rgba(129,140,248,0.15)', delay: '0s', dur: '5s' },
  { left: '62%', top: '58%', size: 120, color: 'rgba(167,139,250,0.12)', delay: '1.5s', dur: '6s' },
  { left: '45%', top: '38%', size: 90, color: 'rgba(99,102,241,0.10)', delay: '3s', dur: '4s' },
];

const ANIM_CSS = `
@keyframes glowPulse{0%,100%{opacity:.3;transform:scale(1)}50%{opacity:.7;transform:scale(1.15)}}
@keyframes scanLine{0%{top:0%;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
@keyframes colorDrift{0%{background:rgba(99,102,241,0)}25%{background:rgba(99,102,241,.04)}50%{background:rgba(129,140,248,.06)}75%{background:rgba(167,139,250,.04)}100%{background:rgba(99,102,241,0)}}
@keyframes drift1{0%{transform:translate(0,0) scale(1);opacity:.5}25%{transform:translate(28px,-34px) scale(1.25);opacity:.85}50%{transform:translate(-20px,-12px) scale(.85);opacity:.45}75%{transform:translate(16px,26px) scale(1.1);opacity:.7}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift2{0%{transform:translate(0,0) scale(1);opacity:.5}25%{transform:translate(-32px,22px) scale(1.3);opacity:.8}50%{transform:translate(14px,-28px) scale(.9);opacity:.4}75%{transform:translate(-16px,-18px) scale(1.1);opacity:.65}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift3{0%{transform:translate(0,0) scale(1);opacity:.4}25%{transform:translate(36px,24px) scale(1.15);opacity:.7}50%{transform:translate(-24px,-30px) scale(.82);opacity:.35}75%{transform:translate(20px,-16px) scale(1.05);opacity:.6}100%{transform:translate(0,0) scale(1);opacity:.4}}
@keyframes drift4{0%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(-28px,-26px) scale(1.3);opacity:.9}50%{transform:translate(22px,18px) scale(.88);opacity:.5}75%{transform:translate(-14px,28px) scale(1.05);opacity:.7}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift5{0%{transform:translate(0,0) scale(1);opacity:.55}25%{transform:translate(24px,32px) scale(1.15);opacity:.8}50%{transform:translate(-30px,-12px) scale(.9);opacity:.4}75%{transform:translate(16px,-26px) scale(1.1);opacity:.65}100%{transform:translate(0,0) scale(1);opacity:.55}}
@keyframes drift6{0%{transform:translate(0,0) scale(1);opacity:.5}25%{transform:translate(-22px,-32px) scale(1.3);opacity:.8}50%{transform:translate(28px,14px) scale(.8);opacity:.4}75%{transform:translate(-18px,24px) scale(1.05);opacity:.6}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift7{0%{transform:translate(0,0) scale(1);opacity:.4}25%{transform:translate(32px,-20px) scale(1.2);opacity:.75}50%{transform:translate(-20px,26px) scale(.85);opacity:.35}75%{transform:translate(24px,12px) scale(1.05);opacity:.6}100%{transform:translate(0,0) scale(1);opacity:.4}}
@keyframes drift8{0%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(-34px,18px) scale(1.15);opacity:.85}50%{transform:translate(20px,-24px) scale(.9);opacity:.45}75%{transform:translate(-16px,-18px) scale(1.1);opacity:.65}100%{transform:translate(0,0) scale(1);opacity:.6}}
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
      <div className="flex gap-4 p-5" style={{ background: '#EDF0F7', height: 'calc(100vh - 150px)', minHeight: 560 }}>
        <div className="w-[300px] shrink-0 animate-pulse rounded-[20px] bg-white/70" />
        <div className="flex-1 animate-pulse rounded-[20px] bg-white/70" />
        <div className="w-[300px] shrink-0 animate-pulse rounded-[20px] bg-white/70" />
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
  const shownFields = showAllFeatures ? fields : fields.slice(0, 4);

  const specimens: any[] = record.specimens ?? [];
  const activeSpecimen = specimens[activeSpec] ?? specimens[0];
  const totalRecords = patientRecs?.total ?? patientRecs?.data?.length ?? 0;
  const openCases = (patientRecs?.data ?? []).filter((r: any) => OPEN.includes(r.status)).length || (OPEN.includes(status) ? 1 : 0);
  const progress = Math.round((currentStep / (STEPS.length - 1)) * 100);

  const aiFinding = sheet?.narrative ? (sheet.narrative.length > 120 ? `${sheet.narrative.slice(0, 120)}…` : sheet.narrative) : 'Awaiting cytological analysis.';
  const activity = [...(record.statusHistory ?? [])].reverse();
  const shownActivity = showAllActivity ? activity : activity.slice(0, 5);

  return (
    <div className="flex justify-center gap-4 p-5" style={{ background: '#EDF0F7', height: 'calc(100vh - 150px)', minHeight: 560 }}>
      <style>{ANIM_CSS}</style>

      {/* ═══════════ LEFT PANEL ═══════════ */}
      <aside className="premium-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-[20px] border border-[#E4E8F4] bg-[#F4F6FC] p-6">
        <button onClick={() => router.back()} className="mb-4 flex items-center gap-1.5 self-start text-[12px] font-medium text-[#64748B] hover:text-[#0F172A]"><ArrowLeft size={14} /> Records</button>

        {/* Identity */}
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-[22px] font-extrabold text-[#0F172A]">{record.labNumber ?? '—'}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-bold" style={{ background: st.bg, color: st.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.fg }} />{status}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {record.formType && <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{isGyn ? 'GYN' : 'NON-GYN'}</span>}
          {record.urgent && <span className="rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[11px] font-bold text-[#DC2626]">URGENT</span>}
        </div>
        <div className="mt-3 text-[15px] font-semibold text-[#1E293B]">{`${record.patient?.firstName ?? ''} ${record.patient?.lastName ?? ''}`.trim() || '—'}</div>
        <div className="text-[13px] text-[#64748B]">{record.client?.officeName || `${record.client?.firstName ?? ''} ${record.client?.lastName ?? ''}`.trim() || '—'}</div>

        {/* Vertical stepper */}
        <div className="mt-6 flex flex-col">
          {STEPS.map((label, i) => {
            const done = i < currentStep; const current = i === currentStep; const passed = i <= currentStep;
            const circle: any = current && special ? { background: STATUS[status].bg, color: STATUS[status].fg }
              : passed ? { background: INDIGO, color: '#fff', boxShadow: current && !special ? '0 0 0 4px rgba(79,70,229,0.2)' : undefined }
                : { background: '#F1F5F9', color: '#94A3B8' };
            return (
              <div key={label} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-bold" style={circle}>
                    {current && special ? (status === 'OnHold' ? <Pause size={14} /> : <X size={14} />) : done ? <Check size={15} /> : <span>{i + 1}</span>}
                  </div>
                  {i < STEPS.length - 1 && <div style={{ width: 2, height: 20, background: i < currentStep ? INDIGO : '#E2E8F0' }} />}
                </div>
                <div className="pt-1">
                  <div className="text-[15px] font-semibold" style={{ color: passed ? '#0F172A' : '#94A3B8' }}>{label}</div>
                  <div className="text-[12px]" style={{ color: current ? (special ? STATUS[status].fg : '#4F46E5') : done ? '#22C55E' : '#94A3B8' }}>
                    {current ? (special ? (status === 'OnHold' ? 'On Hold' : status === 'Failed' ? 'Failed' : 'Cancelled') : 'In progress') : done ? 'Completed' : 'Upcoming'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recommended action */}
        <div className="mt-2 border-t-2 border-[#E4E8F4] pt-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#EF4444]">Recommended Action</div>
          <ActionPanel status={status} pending={statusMut.isPending} go={go} onEditFeatures={() => setDrawer(true)} onOpenSheet={() => setSheetModal(true)} onAuthorize={() => setAuthModal(true)} onInvoice={() => router.push(`/billing?recordId=${id}`)} onReport={() => router.push(`/reports?recordId=${id}`)} onAuthorizer={() => router.push('/authorizer')} />
        </div>

        {/* Clinical features */}
        <div className="mt-5 border-t border-[#E4E8F4] pt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className={LABEL}>Clinical Features</div>
            <button onClick={() => setDrawer(true)} className="grid h-7 w-7 place-items-center rounded-full text-[#94A3B8] hover:bg-[#E2E8F0] hover:text-[#4F46E5]"><Pencil size={13} /></button>
          </div>
          {!hasFeatures ? (
            <div className="text-[12px] text-[#94A3B8]">No clinical features recorded.</div>
          ) : (
            <>
              {shownFields.map((f: any) => {
                const v = featValue(f.fieldKey);
                return (
                  <div key={f.fieldKey} className="flex items-center justify-between gap-2 border-b border-[#F1F5F9] py-2">
                    <span className="text-[11px] text-[#94A3B8]">{f.label}</span>
                    <span className="text-right text-[13px] font-semibold text-[#0F172A]">{f.fieldType === 'CHECKBOX' ? (v ? <Check size={14} className="inline text-[#16A34A]" /> : <span className="text-[#CBD5E1]">—</span>) : (v || <span className="text-[#CBD5E1]">—</span>)}</span>
                  </div>
                );
              })}
              {fields.length > 4 && <button onClick={() => setShowAllFeatures((v) => !v)} className="mt-2 text-[12px] font-semibold text-[#4F46E5] hover:underline">{showAllFeatures ? 'Show less' : 'Show all →'}</button>}
            </>
          )}
        </div>
      </aside>

      {/* ═══════════ CENTER PANEL ═══════════ */}
      <section className="flex w-[640px] max-w-full shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#E4E8F4] bg-white">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#F1F5F9] px-5 py-3.5">
          <div className={LABEL}>Specimen Analysis</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-bold text-[#4F46E5]">{record.labNumber ?? '—'}</span>
            <span className="text-[13px] font-semibold text-[#4F46E5]">{openCases} Active</span>
          </div>
        </div>

        {/* Segmented control (reference-style pill switcher) */}
        <div className="shrink-0 px-5 pt-4">
          <div className="flex gap-1 rounded-full p-1.5" style={{ background: 'linear-gradient(145deg,#EEF3FB,#DBE5F4)', boxShadow: 'inset 0 1px 3px rgba(148,163,184,0.22)' }}>
            <button onClick={() => setDrawer(true)} className="flex-1 rounded-full bg-transparent px-4 py-2.5 text-[14px] font-semibold text-[#3B5EA8] transition-all hover:bg-white hover:text-[#1E3A8A] hover:shadow-[0_4px_14px_rgba(110,130,180,0.28)]">Edit Clinical Features</button>
            <button onClick={() => setSheetModal(true)} className="flex-1 rounded-full bg-transparent px-4 py-2.5 text-[14px] font-semibold text-[#3B5EA8] transition-all hover:bg-white hover:text-[#1E3A8A] hover:shadow-[0_4px_14px_rgba(110,130,180,0.28)]">Add Result Sheet</button>
            <button className="flex-1 rounded-full bg-white px-4 py-2.5 text-[14px] font-bold text-[#1E3A8A]" style={{ boxShadow: '0 4px 14px rgba(110,130,180,0.28), 0 1px 3px rgba(0,0,0,0.05)' }}>{specLabel(activeSpecimen?.type) || 'Specimen'}</button>
          </div>
        </div>

        {/* Content: left detail column + right bounded image */}
        <div className="flex min-h-0 flex-1 gap-6 p-5">
          <div className="flex w-[38%] shrink-0 flex-col">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#E8EDF7] text-[#4F46E5]"><Microscope size={22} /></span>
            <div className="mt-4 text-[17px] font-semibold italic text-[#1E293B]">Patient {specLabel(activeSpecimen?.type)} Analysis</div>
            <div className="mt-1 text-[20px] font-bold text-[#4F46E5]">{progress}%<span className="ml-1.5 text-[14px] font-normal text-[#64748B]">completed</span></div>
            <button onClick={() => setSheetModal(true)} className="mt-2 flex items-center gap-1 self-start text-[14px] font-bold text-[#4F46E5] hover:underline">Enter Analysis <ChevronRight size={15} /></button>

            <div className="mt-auto pt-6">
              <div className="text-[13px] font-bold uppercase tracking-wide text-[#4F46E5]">Attention</div>
              <div className="mt-1.5 text-[13px] italic leading-relaxed text-[#475569]">{aiFinding}</div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#4F46E5] px-3.5 py-1.5 text-[13px] font-semibold text-[#4F46E5]">68% Certainty <Info size={14} /></div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="relative aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#F5F0FA]">
              <Image src="/cytology-sample.png" alt="Cytology specimen" fill unoptimized sizes="420px" style={{ objectFit: 'cover', objectPosition: 'center' }} priority />
              <div className="pointer-events-none absolute inset-0" style={{ animation: 'colorDrift 12s linear infinite' }} />
              {GLOWS.map((g, i) => (
                <div key={`g${i}`} className="pointer-events-none absolute rounded-full" style={{ left: g.left, top: g.top, width: g.size, height: g.size, background: g.color, filter: 'blur(30px)', animation: `glowPulse ${g.dur} ease-in-out ${g.delay} infinite` }} />
              ))}
              {PARTICLES.map((p, i) => (
                <div key={`p${i}`} className="pointer-events-none absolute rounded-full" style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: p.color, filter: p.blur ? `blur(${p.blur}px)` : undefined, animation: `${p.anim} ${p.dur} ease-in-out ${p.delay} infinite` }} />
              ))}
              <div className="pointer-events-none absolute left-0 right-0" style={{ height: 2, background: 'linear-gradient(to right, transparent, rgba(129,140,248,0.4), transparent)', animation: 'scanLine 4s linear infinite' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <aside className="premium-scroll flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-[20px] border border-[#E4E8F4] bg-white p-6">
        <div className={`${LABEL} mb-5`}>Patient Stats</div>
        <Stat icon={Activity} label="Total Records" value={String(totalRecords)} unit="cases" />
        <Stat icon={FlaskConical} label="Open Cases" value={String(openCases)} unit="in progress" />
        <Stat icon={Clock} label="Avg TAT" value="—" unit="days" />

        <div className="mb-4 mt-1 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Activity Timeline</div>
        <div className="flex flex-col">
          {shownActivity.map((ev: any) => (
            <div key={ev.id} className="flex items-start gap-2.5 border-b border-[#F8FAFC] py-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[ev.status] ?? '#94A3B8' }} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#0F172A]">{ev.status}</div>
                <div className="truncate text-[11px] text-[#94A3B8]">{ev.user ? `${ev.user.firstName ?? ''} ${ev.user.lastName ?? ''}`.trim() : 'System'} · {relTime(ev.createdAt)}</div>
              </div>
            </div>
          ))}
          {activity.length === 0 && <div className="text-[12px] text-[#94A3B8]">No activity yet.</div>}
          {activity.length > 5 && <button onClick={() => setShowAllActivity((v) => !v)} className="mt-2 self-start text-[12px] font-semibold text-[#4F46E5] hover:underline">{showAllActivity ? 'Show less' : `Show more (${activity.length})`}</button>}
        </div>

        <div className="my-4 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Result Sheet</div>
        {!sheet ? (
          <>
            <div className="text-[13px] text-[#94A3B8]">No result sheet.</div>
            <button onClick={() => setSheetModal(true)} className={`${rightBtn} mt-2`}>Add Result Sheet</button>
          </>
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

        <div className="my-4 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Next Steps</div>
        <div className="flex flex-col gap-2">
          {status === 'Resulted' && <button onClick={() => router.push('/authorizer')} className={rightBtn}>Open Authorizer</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={rightBtn}>Release Report</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/billing?recordId=${id}`)} className={rightBtn}>Create Invoice</button>}
          {['Billed', 'Paid', 'Viewed'].includes(status) && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={rightBtn}>View Report</button>}
          <button onClick={() => router.push('/records')} className={rightBtn}>Back to Records</button>
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
    <div className="mb-5 flex items-center gap-3.5">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#EEF2FF] text-[#4F46E5]"><Icon size={20} /></span>
      <div>
        <div className="text-[12px] text-[#94A3B8]">{label}</div>
        <div className="flex items-baseline gap-1.5"><span className="text-[28px] font-bold leading-none text-[#0F172A]">{value}</span><span className="text-[14px] text-[#64748B]">{unit}</span></div>
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
  const Title = ({ children }: any) => <div className="mt-1.5 text-[18px] font-bold text-[#0F172A]">{children}</div>;
  const Desc = ({ children }: any) => <div className="mt-1 text-[13px] leading-[1.5] text-[#64748B]">{children}</div>;
  const Row = ({ children }: any) => <div className="mt-3.5 flex flex-col gap-2">{children}</div>;
  const Prim = ({ children, ...rest }: any) => <button {...rest} className={actionPrimary}><span>{children}</span><ChevronRight size={16} /></button>;

  switch (status) {
    case 'Pending':
      return (<><Title>Ready to Submit</Title><Desc>Review clinical features and submit this record for processing.</Desc>
        <Row>
          <Prim disabled={pending} onClick={() => go('Submitted', { title: 'Submit for processing?', desc: 'This moves the record into the processing queue.' })}>Submit for Processing</Prim>
        </Row></>);
    case 'Submitted':
      return (<><Title>Awaiting Processing</Title><Desc>Mark this record as in processing when the specimen is received in lab.</Desc>
        <Row>
          <Prim disabled={pending} onClick={() => go('Processing')}>Mark as Processing</Prim>
          <button disabled={pending} className={actionSecondary} onClick={() => go('OnHold')}>Put On Hold</button>
        </Row></>);
    case 'Processing':
    case 'Partial':
      return (<><Title>Add Result Sheet</Title><Desc>Enter cytology findings for this specimen.</Desc>
        <Row>
          <Prim onClick={p.onOpenSheet}>Open Result Sheet</Prim>
          {status === 'Processing' && <button disabled={pending} className={actionSecondary} onClick={() => go('Partial')}>Mark Partial</button>}
          <button disabled={pending} className={actionSecondary} onClick={() => go('Completed', { title: 'Mark complete?', desc: 'Confirm the result sheet is complete for this record.' })}>Mark Complete</button>
        </Row></>);
    case 'Completed':
      return (<><Title>Ready for Review</Title><Desc>Result sheet is complete. Submit for pathologist authorization.</Desc>
        <Row><Prim disabled={pending} onClick={() => go('Resulted', { title: 'Submit for authorization?', desc: 'This places the record in the pathologist authorization queue.' })}>Submit for Authorization</Prim></Row></>);
    case 'Resulted':
      return (<><Title>Awaiting Authorization</Title><Desc>This record is in the authorization queue.</Desc>
        <Row><Prim onClick={p.onAuthorize}>Authorize Now</Prim>
          <button onClick={p.onAuthorizer} className={actionSecondary}>Batch Authorizer</button></Row></>);
    case 'Approved':
      return (<><CheckHero /><Title>Approved — Ready to Bill</Title><Desc>Record is authorized. Generate an invoice for the referring client.</Desc>
        <Row><Prim onClick={p.onInvoice}>Create Invoice</Prim>
          <button className={actionSecondary} onClick={p.onReport}><Download size={14} /> Download Report</button></Row></>);
    case 'Billed':
    case 'Paid':
      return (<><CheckHero /><Title>Billing Complete</Title><Desc>This record has been billed{status === 'Paid' ? ' and paid' : ''}.</Desc>
        <Row><button className={actionSecondary} onClick={p.onReport}><Download size={14} /> Download Report</button></Row></>);
    case 'OnHold':
      return (<><Title>Record On Hold</Title><Desc>Resume processing or cancel this record.</Desc>
        <Row><Prim disabled={pending} onClick={() => go('Submitted')}>Resume Processing</Prim>
          <button disabled={pending} className={actionSecondary} onClick={() => go('Disabled', { title: 'Cancel record?', desc: 'This marks the record as cancelled.' })}>Cancel Record</button></Row></>);
    case 'Failed':
    case 'Disabled':
      return (<><Title>Record {status === 'Failed' ? 'Failed' : 'Cancelled'}</Title><Desc>Reopen this record to move it back into processing.</Desc>
        <Row><Prim disabled={pending} onClick={() => go('Submitted', { title: 'Reopen record?', desc: 'This returns the record to the processing workflow.' })}>Reopen Record</Prim></Row></>);
    default:
      return (<><Title>Complete</Title><Desc>This record has completed its lifecycle.</Desc></>);
  }
}

function CheckHero() {
  return <div className="mb-3 mt-2 grid h-10 w-10 place-items-center rounded-full bg-[#DCFCE7]"><CheckCircle2 size={22} className="text-[#16A34A]" /></div>;
}
