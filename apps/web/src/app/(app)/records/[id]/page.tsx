'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity, AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, Download,
  FileText, FlaskConical, History, Microscope, Pause, Pencil, Play, Printer, Receipt, RotateCcw, ScanEye, Send, ShieldCheck, Users, X, XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { RecordFormDrawer } from '@/components/RecordFormDrawer';
import { ResultSheetModal } from '@/components/ResultSheetModal';
import { AuthorizationModal } from '@/components/AuthorizationModal';
import { RecordAttachments } from '@/components/RecordAttachments';
import { PriorHistoryPanel } from '@/components/PriorHistoryPanel';
import { FeatureGate } from '@/components/FeatureGate';
import { PrintLabelsModal } from '@/components/PrintLabelsModal';
import { useFeatures } from '@/lib/feature-context';
import { useAuth } from '@/lib/auth';
import { avatarColor, type WorkloadUser } from '@/lib/workload';
import { RESULT_META as CORR_META, type CorrelationCase } from '@/lib/correlation';
import { STATUS_META as RECALL_META, dueColor, dueLabel, shortDate as recallDate, type Recall } from '@/lib/recall';
import { AddSlideModal } from '@/components/AddSlideModal';
import { type DigitalSlide } from '@/lib/wsi';
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
// Meaningful lifecycle completion % per status.
const PROGRESS_MAP: Record<string, number> = {
  Pending: 5, Submitted: 15, Processing: 35, Partial: 55,
  Completed: 70, Resulted: 85, Approved: 92, Billed: 96,
  Paid: 98, Viewed: 100, OnHold: 35, Failed: 35, Disabled: 0,
};
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

// Button styles — rectangular (rounded rectangle), padded, with an icon.
// Action buttons — side-by-side pills. Primary = indigo gradient, secondary =
// light-blue gradient (glassy) with navy text, matching the reference chip.
const ACTION_BTN = 'flex min-w-[150px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-3 text-[14px] font-bold transition-all hover:brightness-[0.97] active:scale-[0.99] disabled:opacity-60';
const PRIM_STYLE = { background: 'linear-gradient(135deg,#4F46E5 0%,#4338CA 100%)', color: '#FFFFFF', boxShadow: '0 6px 16px rgba(79,70,229,0.28)' } as const;
const SEC_STYLE = { background: 'linear-gradient(135deg,#EFF4FD 0%,#D7E5F8 100%)', color: '#1E40AF', border: '1px solid #C7D7EF', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(30,64,175,0.10)' } as const;
const rightBtn = 'flex w-full items-center justify-center gap-2 rounded-xl bg-[#F1F5F9] px-3 py-3.5 text-[15px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#E2E8F0]';
const LABEL = 'text-[14px] font-bold italic uppercase tracking-[0.05em] text-[#3B5EA8]';

// Floating-particle / glow configs — drifting "cells" over the specimen.
const PARTICLES = [
  { left: '14%', top: '22%', size: 22, color: 'rgba(99,102,241,0.85)', anim: 'drift1', delay: '0s', dur: '7s', blur: 0 },
  { left: '72%', top: '16%', size: 17, color: 'rgba(139,92,246,0.8)', anim: 'drift2', delay: '0.5s', dur: '8s', blur: 0 },
  { left: '40%', top: '60%', size: 30, color: 'rgba(129,140,248,0.6)', anim: 'drift3', delay: '1.1s', dur: '9s', blur: 1 },
  { left: '84%', top: '54%', size: 14, color: 'rgba(79,70,229,0.9)', anim: 'drift4', delay: '1.7s', dur: '7s', blur: 0 },
  { left: '24%', top: '78%', size: 20, color: 'rgba(99,102,241,0.8)', anim: 'drift5', delay: '2.2s', dur: '7s', blur: 0 },
  { left: '55%', top: '30%', size: 12, color: 'rgba(167,139,250,0.85)', anim: 'drift6', delay: '2.8s', dur: '8s', blur: 0 },
  { left: '10%', top: '48%', size: 26, color: 'rgba(129,140,248,0.6)', anim: 'drift7', delay: '3.3s', dur: '8s', blur: 1 },
  { left: '78%', top: '82%', size: 16, color: 'rgba(99,102,241,0.85)', anim: 'drift8', delay: '3.8s', dur: '9s', blur: 0 },
  { left: '34%', top: '38%', size: 13, color: 'rgba(139,92,246,0.8)', anim: 'drift2', delay: '0.9s', dur: '8s', blur: 0 },
  { left: '62%', top: '70%', size: 18, color: 'rgba(167,139,250,0.65)', anim: 'drift5', delay: '1.9s', dur: '8s', blur: 0 },
  { left: '88%', top: '32%', size: 20, color: 'rgba(129,140,248,0.7)', anim: 'drift3', delay: '2.5s', dur: '7s', blur: 0 },
  { left: '18%', top: '64%', size: 14, color: 'rgba(79,70,229,0.85)', anim: 'drift7', delay: '3.6s', dur: '9s', blur: 0 },
  { left: '48%', top: '16%', size: 12, color: 'rgba(99,102,241,0.8)', anim: 'drift4', delay: '2.1s', dur: '8s', blur: 0 },
  { left: '68%', top: '46%', size: 28, color: 'rgba(167,139,250,0.55)', anim: 'drift6', delay: '3.1s', dur: '10s', blur: 1 },
  { left: '30%', top: '52%', size: 10, color: 'rgba(79,70,229,0.95)', anim: 'drift1', delay: '1.4s', dur: '6s', blur: 0 },
  { left: '52%', top: '85%', size: 16, color: 'rgba(99,102,241,0.8)', anim: 'drift8', delay: '4.2s', dur: '9s', blur: 0 },
];
const GLOWS = [
  { left: '18%', top: '22%', size: 130, color: 'rgba(129,140,248,0.32)', delay: '0s', dur: '4s' },
  { left: '62%', top: '58%', size: 150, color: 'rgba(167,139,250,0.28)', delay: '1.2s', dur: '5s' },
  { left: '45%', top: '38%', size: 110, color: 'rgba(99,102,241,0.26)', delay: '2.4s', dur: '3.5s' },
];

const ANIM_CSS = `
@keyframes glowPulse{0%,100%{opacity:.45;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
@keyframes scanLine{0%{top:0%;opacity:0}8%{opacity:1}92%{opacity:1}100%{top:100%;opacity:0}}
@keyframes colorDrift{0%{background:rgba(99,102,241,.02)}25%{background:rgba(99,102,241,.13)}50%{background:rgba(129,140,248,.18)}75%{background:rgba(167,139,250,.13)}100%{background:rgba(99,102,241,.02)}}
@keyframes drift1{0%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(48px,-58px) scale(1.5);opacity:1}50%{transform:translate(-36px,-22px) scale(.75);opacity:.55}75%{transform:translate(28px,44px) scale(1.25);opacity:.9}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift2{0%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(-54px,38px) scale(1.55);opacity:1}50%{transform:translate(24px,-48px) scale(.8);opacity:.5}75%{transform:translate(-28px,-30px) scale(1.25);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift3{0%{transform:translate(0,0) scale(1);opacity:.5}25%{transform:translate(60px,40px) scale(1.4);opacity:.95}50%{transform:translate(-40px,-50px) scale(.72);opacity:.45}75%{transform:translate(34px,-28px) scale(1.2);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift4{0%{transform:translate(0,0) scale(1);opacity:.7}25%{transform:translate(-48px,-44px) scale(1.55);opacity:1}50%{transform:translate(38px,30px) scale(.78);opacity:.55}75%{transform:translate(-24px,48px) scale(1.2);opacity:.9}100%{transform:translate(0,0) scale(1);opacity:.7}}
@keyframes drift5{0%{transform:translate(0,0) scale(1);opacity:.65}25%{transform:translate(42px,54px) scale(1.4);opacity:1}50%{transform:translate(-50px,-22px) scale(.8);opacity:.5}75%{transform:translate(28px,-44px) scale(1.25);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.65}}
@keyframes drift6{0%{transform:translate(0,0) scale(1);opacity:.6}25%{transform:translate(-38px,-54px) scale(1.55);opacity:1}50%{transform:translate(48px,24px) scale(.7);opacity:.5}75%{transform:translate(-30px,42px) scale(1.2);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.6}}
@keyframes drift7{0%{transform:translate(0,0) scale(1);opacity:.5}25%{transform:translate(54px,-34px) scale(1.45);opacity:.95}50%{transform:translate(-34px,44px) scale(.75);opacity:.45}75%{transform:translate(40px,20px) scale(1.2);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.5}}
@keyframes drift8{0%{transform:translate(0,0) scale(1);opacity:.7}25%{transform:translate(-58px,30px) scale(1.4);opacity:1}50%{transform:translate(34px,-42px) scale(.8);opacity:.55}75%{transform:translate(-28px,-30px) scale(1.25);opacity:.85}100%{transform:translate(0,0) scale(1);opacity:.7}}
@keyframes microDrift{0%{transform:translate(0px,0px) scale(1.02)}25%{transform:translate(-10px,7px) scale(1.05)}50%{transform:translate(8px,-6px) scale(1.03)}75%{transform:translate(-6px,-9px) scale(1.06)}100%{transform:translate(0px,0px) scale(1.02)}}
@keyframes ringSpin{to{transform:rotate(360deg)}}
`;

// ─── Page ────────────────────────────────────────────────────────────────────
function LifecycleRings({ status }: { status: string }) {
  const STAGES = [
    { label: 'Intake', statuses: ['Pending', 'Submitted'], color: '#6366F1', ghostColor: '#E0E7FF' },
    { label: 'Processing', statuses: ['Processing', 'Partial'], color: '#8B5CF6', ghostColor: '#EDE9FE' },
    { label: 'Results', statuses: ['Completed', 'Resulted'], color: '#06B6D4', ghostColor: '#CFFAFE' },
    { label: 'Authorization', statuses: ['Approved'], color: '#16A34A', ghostColor: '#DCFCE7' },
    { label: 'Complete', statuses: ['Billed', 'Paid', 'Viewed'], color: '#4F46E5', ghostColor: '#EEF2FF' },
  ];

  const currentStageIdx = STAGES.findIndex((s) => s.statuses.includes(status));

  const rings = STAGES.map((stage, i) => ({
    ...stage,
    pct: i < currentStageIdx ? 100
      : i === currentStageIdx ? ((stage.statuses.indexOf(status) + 1) / stage.statuses.length) * 100
        : 0,
    isCurrent: i === currentStageIdx,
    isComplete: i < currentStageIdx,
  }));

  const SIZE = 360;
  const CENTER = SIZE / 2;
  const RING_WIDTH = 22;
  const RING_GAP = 6;
  const R0 = 168;
  const radii = [R0, R0 - (RING_WIDTH + RING_GAP), R0 - (RING_WIDTH + RING_GAP) * 2, R0 - (RING_WIDTH + RING_GAP) * 3, R0 - (RING_WIDTH + RING_GAP) * 4];

  const TOFF = 8;
  const LR = R0 + 30; // label radius — just outside the outer ring
  return (
    <div style={{ position: 'relative', width: 540, height: SIZE + TOFF * 2 }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ position: 'absolute', left: 0, top: TOFF }}>
        {rings.map((ring, i) => {
          const r = radii[i];
          const circ = 2 * Math.PI * r;
          // Spiral effect: every ring slowly spins, each at a staggered speed + phase.
          const spin = `ringSpin ${(8 + i * 1.6).toFixed(1)}s linear ${(-i * 1.2).toFixed(1)}s infinite`;
          return (
            <g key={i}>
              <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={ring.ghostColor} strokeWidth={RING_WIDTH} opacity={0.6} />
              {ring.pct > 0 && (
                <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={ring.color} strokeWidth={RING_WIDTH} strokeLinecap="round"
                  strokeDasharray={`${(ring.pct / 100) * circ} ${circ}`} strokeDashoffset={circ / 4}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: ring.isCurrent ? `${spin}, ringPulse 2s ease-in-out infinite` : spin }} />
              )}
              {/* Spiralling highlight — a short bright segment orbits each ring at a staggered speed */}
              <circle cx={CENTER} cy={CENTER} r={r} fill="none" stroke={ring.color} strokeWidth={RING_WIDTH * 0.5} strokeLinecap="round"
                strokeDasharray={`${circ * 0.09} ${circ}`} opacity={0.55}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: `ringSpin ${(5 + i * 1.1).toFixed(1)}s linear ${(-i * 0.7).toFixed(1)}s infinite` }} />
            </g>
          );
        })}
        <text x={CENTER} y={CENTER - 12} textAnchor="middle" fontSize="42" fontWeight="800" fill="#0F172A" fontFamily="Geist, sans-serif">
          {Math.round(rings.reduce((s, r) => s + r.pct, 0) / rings.length)}%
        </text>
        <text x={CENTER} y={CENTER + 22} textAnchor="middle" fontSize="15" fontWeight="600" fill="#94A3B8" fontFamily="Geist, sans-serif" letterSpacing="0.08em">OVERALL</text>
      </svg>

      {/* Data points curved around the outer ring (right-side arc) */}
      {rings.map((ring, i) => {
        const theta = ((-60 + i * 30) * Math.PI) / 180;
        const x = CENTER + LR * Math.cos(theta);
        const y = TOFF + CENTER + LR * Math.sin(theta);
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 10, opacity: ring.pct === 0 ? 0.45 : 1, whiteSpace: 'nowrap' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: ring.pct > 0 ? ring.color : ring.ghostColor, flexShrink: 0, boxShadow: ring.isCurrent ? `0 0 10px ${ring.color}` : 'none', animation: ring.isCurrent ? 'ringPulse 2s ease-in-out infinite' : undefined }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: ring.pct > 0 ? '#0F172A' : '#94A3B8' }}>{ring.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ring.isComplete ? ring.color : ring.isCurrent ? ring.color : '#CBD5E1' }}>
              {ring.isComplete ? '✓' : ring.isCurrent ? '●' : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RecordDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const id = String(useParams().id);

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; desc: string; run: () => void } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [sheetModal, setSheetModal] = useState(false);
  const [authModal, setAuthModal] = useState(false);
  const [printLabels, setPrintLabels] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const { data: recordEscalations } = useQuery<any[]>({ queryKey: ['escalations', 'record', id], enabled: !!id, queryFn: () => api.get('/escalations', { params: { recordId: id } }).then((r) => r.data) });
  const openEscalation = (recordEscalations ?? []).find((e) => ['Pending', 'Acknowledged', 'UnderReview'].includes(e.status));

  const { can } = useAuth();
  const { isEnabled } = useFeatures();
  const canAssign = can('record:change') && isEnabled('CASE_ASSIGNMENT');
  const { data: recordQC } = useQuery<any[]>({ queryKey: ['qc', 'record', id], enabled: !!id && isEnabled('QC_MODULE'), queryFn: () => api.get('/qc', { params: { recordId: id, pageSize: 100 } }).then((r) => r.data.data) });
  const qcFailures = (recordQC ?? []).filter((c) => c.result === 'Fail');
  const { data: patientCorrelations } = useQuery<CorrelationCase[]>({ queryKey: ['correlations-patient', record?.patientId], enabled: !!record?.patientId && isEnabled('CORRELATION_TRACKING'), queryFn: () => api.get(`/correlation/patient/${record.patientId}`).then((r) => r.data) });
  const recordCorrelation = (patientCorrelations ?? []).find((c) => c.cytologyRecordId === id);
  const { data: patientRecalls } = useQuery<Recall[]>({ queryKey: ['patient-recalls', record?.patientId], enabled: !!record?.patientId && isEnabled('PATIENT_RECALL'), queryFn: () => api.get(`/recalls/patient/${record.patientId}`).then((r) => r.data) });
  const recordRecall = (patientRecalls ?? []).find((r) => r.triggerRecord?.id === id);
  const { data: recordSlide } = useQuery<DigitalSlide | null>({ queryKey: ['wsi-record', id], enabled: !!id && isEnabled('WSI_VIEWER'), queryFn: () => api.get(`/wsi/record/${id}`).then((r) => r.data) });
  const [addSlideOpen, setAddSlideOpen] = useState(false);
  const { data: recordReagents } = useQuery<any[]>({ queryKey: ['reagents', 'record', id], enabled: !!id && isEnabled('REAGENT_TRACKING'), queryFn: () => api.get(`/reagents/record/${id}`).then((r) => r.data) });
  const { data: team = [] } = useQuery<WorkloadUser[]>({ queryKey: ['workload-summary'], enabled: canAssign, queryFn: () => api.get('/workload/summary').then((r) => r.data) });
  const assignMut = useMutation({
    mutationFn: (userId: string | null) => api.patch(`/records/${id}/assign`, { assignedToId: userId }).then((r) => r.data),
    onSuccess: () => { notify('ok', 'Assignment updated'); refetchAll(); qc.invalidateQueries({ queryKey: ['workload-summary'] }); },
    onError: () => notify('err', 'Could not update assignment'),
  });

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
        <div className="flex-1 min-w-[280px] animate-pulse rounded-[20px] bg-white/70" />
        <div className="flex-1 animate-pulse rounded-[20px] bg-white/70" />
        <div className="flex-1 min-w-[280px] animate-pulse rounded-[20px] bg-white/70" />
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
  const allPatientRecords: any[] = patientRecs?.data ?? [];
  const totalRecords = allPatientRecords.length || 1; // at least the current record
  const openCases = allPatientRecords.filter((r: any) => OPEN.includes(r.status)).length || (OPEN.includes(status) ? 1 : 0);
  const progress = PROGRESS_MAP[status] ?? 0;

  // Turnaround: days between Submitted and Approved for this record.
  const submittedAt = record.statusHistory?.find((e: any) => e.status === 'Submitted')?.createdAt;
  const approvedAt = record.statusHistory?.find((e: any) => e.status === 'Approved')?.createdAt;
  const avgTat = submittedAt
    ? Math.round((new Date(approvedAt || Date.now()).getTime() - new Date(submittedAt).getTime()) / 86400000 * 10) / 10
    : null;

  const cytologyImg = isGyn ? '/cytology-sample.png' : '/cytology-nongyn.png';
  const hasAbnormal = !!sheet && (sheet.resultEntries ?? []).some((e: any) => (e.resultLines ?? []).some((l: any) => l.abnormalFinding));

  const aiFinding = sheet?.narrative ? (sheet.narrative.length > 120 ? `${sheet.narrative.slice(0, 120)}…` : sheet.narrative) : 'Awaiting cytological analysis.';
  const activity = [...(record.statusHistory ?? [])].reverse();
  const shownActivity = showAllActivity ? activity : activity.slice(0, 5);

  return (
    <div className="flex gap-4 p-5" style={{ background: '#EDF0F7', height: 'calc(100vh - 150px)', minHeight: 560 }}>
      <style>{ANIM_CSS}</style>

      {/* ═══════════ CENTER PANEL ═══════════ */}
      <section className="relative flex flex-1 min-w-0 flex-col rounded-[20px] border border-[#E4E8F4] bg-white">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#F1F5F9] px-5 py-3.5">
          <div className={LABEL}>Specimen Analysis</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-bold text-[#4F46E5]">{record.labNumber ?? '—'}</span>
            <span className="text-[13px] font-semibold text-[#4F46E5]">{openCases} Active</span>
          </div>
        </div>

        {/* Content: left detail column + right image (beside, larger) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flex: 1, padding: '16px 20px' }}>
          <div style={{ flexShrink: 0 }} className="flex w-[560px] flex-col">
            <LifecycleRings status={status} />
            <div className="mt-4 flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#E8EDF7] text-[#4F46E5]"><Microscope size={22} /></span>
              <div>
                <div className="text-[17px] font-semibold italic text-[#1E293B]">Patient {specLabel(activeSpecimen?.type)} Analysis</div>
                <div className="mt-1 text-[20px] font-bold text-[#4F46E5]">{progress}%<span className="ml-1.5 text-[14px] font-normal text-[#64748B]">completed</span></div>
                <button onClick={() => setSheetModal(true)} className="mt-1.5 flex items-center gap-1 self-start text-[14px] font-bold text-[#4F46E5] hover:underline">Enter Analysis <ChevronRight size={15} /></button>
              </div>
            </div>

            <div className="mt-auto pt-6">
              {sheet && aiFinding !== 'Awaiting cytological analysis.' && (
                <div className="text-[13px] font-bold uppercase tracking-wide text-[#4F46E5]">Attention</div>
              )}
              {sheet ? (
                <div className="mt-1.5 text-[13px] italic leading-relaxed text-[#475569]">{aiFinding}</div>
              ) : (
                <div className="mt-1.5 text-[13px] italic text-[#94A3B8]">Awaiting cytological analysis.</div>
              )}
              {sheet && (
                hasAbnormal ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#DC2626] px-3.5 py-1.5 text-[13px] font-semibold text-[#DC2626]"><AlertTriangle size={14} /> Abnormal findings detected</div>
                ) : sheet.authorized ? (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#16A34A] px-3.5 py-1.5 text-[13px] font-semibold text-[#16A34A]"><CheckCircle2 size={14} /> Authorized</div>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border-[1.5px] border-[#16A34A] px-3.5 py-1.5 text-[13px] font-semibold text-[#16A34A]"><CheckCircle2 size={14} /> Normal findings</div>
                )
              )}
            </div>

            {/* Recommended action (moved from left column) */}
            <div className="mt-5 border-t-2 border-[#E4E8F4] pt-5">
              <div className="text-[15px] font-bold italic uppercase tracking-[0.06em] text-[#EF4444]">Recommended Action</div>
              <ActionPanel status={status} pending={statusMut.isPending} go={go} onEditFeatures={() => setDrawer(true)} onOpenSheet={() => setSheetModal(true)} onAuthorize={() => setAuthModal(true)} onInvoice={() => router.push(`/billing?recordId=${id}`)} onReport={() => router.push(`/reports?recordId=${id}`)} onAuthorizer={() => router.push('/authorizer')} />
            </div>
          </div>

          <div style={{ flex: 1, alignSelf: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 20 }}>
            {/* Living-microscope view: specimen field slowly pans + zooms, with drifting particles over it */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 1040 }}>
              <img src={cytologyImg} alt="Cytology specimen" style={{ display: 'block', width: '100%', height: 'auto', transformOrigin: 'center', animation: 'microDrift 20s ease-in-out infinite' }} />
              {PARTICLES.map((p, i) => (
                <div key={`p${i}`} className="pointer-events-none absolute rounded-full" style={{ left: p.left, top: p.top, width: p.size, height: p.size, background: p.color, filter: p.blur ? `blur(${p.blur}px)` : undefined, animation: `${p.anim} ${p.dur} ease-in-out ${p.delay} infinite` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <aside className="premium-scroll flex w-[340px] shrink-0 flex-col overflow-y-auto rounded-[20px] border border-[#E4E8F4] bg-white p-6">
        {/* Record header (moved from left column) */}
        <div className="mb-5 border-b border-[#F1F5F9] pb-5">
          <div className="flex items-center gap-2.5">
            <button onClick={() => router.back()} className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-[#64748B] hover:text-[#0F172A]"><ArrowLeft size={15} /> Records</button>
            <span className="shrink-0 whitespace-nowrap font-mono text-[20px] font-extrabold text-[#0F172A]">{record.labNumber ?? '—'}</span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold" style={{ background: st.bg, color: st.fg }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: st.fg }} />{status}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {record.formType && <span className="rounded-md px-2 py-0.5 text-[12px] font-bold" style={isGyn ? { background: '#EEF3FF', color: '#4F46E5' } : { background: '#F0FDF4', color: '#16A34A' }}>{isGyn ? 'GYN' : 'NON-GYN'}</span>}
            {record.urgent && <span className="rounded-md bg-[#FEF2F2] px-2 py-0.5 text-[12px] font-bold text-[#DC2626]">URGENT</span>}
          </div>
          <div className="mt-3 text-[17px] font-semibold text-[#1E293B]">{`${record.patient?.firstName ?? ''} ${record.patient?.lastName ?? ''}`.trim() || '—'}</div>
          <div className="text-[14px] text-[#64748B]">{record.client?.officeName || `${record.client?.firstName ?? ''} ${record.client?.lastName ?? ''}`.trim() || '—'}</div>
          {record.patientId && (
            <FeatureGate feature="PRIOR_HISTORY">
              <button onClick={() => setHistoryOpen(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-[7px] text-[13px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]">
                <History size={15} /> Prior History
              </button>
            </FeatureGate>
          )}
          {openEscalation && (
            <FeatureGate feature="ABNORMAL_ESCALATION">
              <button onClick={() => router.push('/escalations')} className="mt-3 flex w-full items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors"
                style={{ background: openEscalation.severity === 'Abnormal' ? '#FEFCE8' : '#FEF2F2', borderColor: openEscalation.severity === 'Abnormal' ? '#FEF08A' : '#FECACA' }}>
                <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: openEscalation.severity === 'Malignant' ? '#B91C1C' : openEscalation.severity === 'HighGrade' ? '#EF4444' : '#A16207' }} />
                <span>
                  <span className="block text-[13px] font-bold" style={{ color: openEscalation.severity === 'Malignant' ? '#B91C1C' : openEscalation.severity === 'HighGrade' ? '#EF4444' : '#A16207' }}>
                    Escalation Alert — {openEscalation.severity === 'HighGrade' ? 'High Grade' : openEscalation.severity}
                  </span>
                  <span className="block text-[12px] text-[#64748B]">Status: {openEscalation.status} · click to review</span>
                </span>
              </button>
            </FeatureGate>
          )}
          <FeatureGate feature="CASE_ASSIGNMENT">
            <div className="mt-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Assignment</div>
              <div className="mt-1.5 flex items-center gap-2">
                {record.assignedTo ? (
                  <>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: avatarColor(`${record.assignedTo.firstName} ${record.assignedTo.lastName}`).bg, color: avatarColor(`${record.assignedTo.firstName} ${record.assignedTo.lastName}`).fg }}>
                      {`${record.assignedTo.firstName?.[0] ?? ''}${record.assignedTo.lastName?.[0] ?? ''}`.toUpperCase()}
                    </span>
                    <span className="text-[13px] font-semibold text-[#0F172A]">{record.assignedTo.firstName} {record.assignedTo.lastName}</span>
                  </>
                ) : (
                  <span className="text-[13px] text-[#94A3B8]">Unassigned</span>
                )}
              </div>
              {record.assignedAt && <div className="mt-1 text-[11px] text-[#94A3B8]">Assigned {new Date(record.assignedAt).toLocaleDateString()}</div>}
              {canAssign && (
                <select value={record.assignedToId ?? ''} onChange={(e) => assignMut.mutate(e.target.value || null)}
                  className="mt-2 h-8 w-full rounded-lg border border-[#E2E8F0] bg-white px-2 text-[13px] outline-none focus:border-[#4F46E5]">
                  <option value="">Unassigned</option>
                  {team.map((u) => <option key={u.userId} value={u.userId}>{u.userName}</option>)}
                </select>
              )}
            </div>
          </FeatureGate>
          {qcFailures.length > 0 && (
            <FeatureGate feature="QC_MODULE">
              <div className="mt-3 rounded-[10px] border px-3.5 py-3" style={{ background: '#FEFCE8', borderColor: '#FEF08A' }}>
                <div className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: '#A16207' }}>
                  <AlertTriangle size={14} /> QC Issues ({qcFailures.length})
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {qcFailures.slice(0, 4).map((c) => (
                    <div key={c.id} className="text-[12px] text-[#334155]">
                      <span className="font-semibold">{c.checkType.replace(/([A-Z])/g, ' $1').trim()}</span>
                      {c.failureReason ? ` — ${c.failureReason}` : ''}
                      <span className="block text-[11px] text-[#94A3B8]">{new Date(c.performedAt).toLocaleDateString()} · {c.performedBy ? `${c.performedBy.firstName} ${c.performedBy.lastName}` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </FeatureGate>
          )}
          {recordCorrelation && (
            <FeatureGate feature="CORRELATION_TRACKING">
              <button onClick={() => router.push(`/correlation/${recordCorrelation.id}`)} className="mt-3 flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-left transition-colors hover:bg-[#EEF3FF]">
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Correlation</span>
                  <span className="block text-[13px] font-semibold text-[#0F172A]">Cyto-histo linked</span>
                </span>
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: CORR_META[recordCorrelation.correlationResult ?? 'Unresolved'].bg, color: CORR_META[recordCorrelation.correlationResult ?? 'Unresolved'].fg }}>
                  {CORR_META[recordCorrelation.correlationResult ?? 'Unresolved'].label}
                </span>
              </button>
            </FeatureGate>
          )}
          {recordRecall && (
            <FeatureGate feature="PATIENT_RECALL">
              <button onClick={() => router.push('/recalls')} className="mt-3 flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#E2E8F0] px-3.5 py-2.5 text-left transition-colors hover:bg-[#EEF3FF]" style={{ background: RECALL_META[recordRecall.status].rowBg ?? '#F8FAFC' }}>
                <span>
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Recall Scheduled</span>
                  <span className="block text-[13px] font-semibold text-[#0F172A]">{recordRecall.triggerDiagnosis} · due {recallDate(recordRecall.dueDate)}</span>
                  {['Pending', 'Due', 'Overdue'].includes(recordRecall.status) && <span className="block text-[12px] font-semibold" style={{ color: dueColor(recordRecall.daysUntilDue) }}>{dueLabel(recordRecall.daysUntilDue)}</span>}
                </span>
                <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: RECALL_META[recordRecall.status].bg, color: RECALL_META[recordRecall.status].fg }}>{RECALL_META[recordRecall.status].label}</span>
              </button>
            </FeatureGate>
          )}
          <FeatureGate feature="WSI_VIEWER">
            {recordSlide ? (
              <button onClick={() => router.push(`/wsi/${recordSlide.id}`)} className="mt-3 flex w-full items-center gap-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3 text-left transition-colors hover:bg-[#EEF3FF]">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-black text-white"><ScanEye size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Digital Slide</span>
                  <span className="block truncate text-[13px] font-semibold text-[#0F172A]">{recordSlide.stain ?? 'Slide'}{recordSlide.magnification ? ` · ${recordSlide.magnification}` : ''}</span>
                  <span className="block text-[12px] text-[#64748B]">{recordSlide.annotationCount} annotation{recordSlide.annotationCount === 1 ? '' : 's'}</span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-[#4F46E5]">View →</span>
              </button>
            ) : (
              <div className="mt-3 rounded-[10px] border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#64748B]"><ScanEye size={15} className="text-[#94A3B8]" /> No digital slide</div>
                {can('record:change') && (
                  <button onClick={() => setAddSlideOpen(true)} className="mt-2 text-[12px] font-semibold text-[#4F46E5] hover:underline">+ Add Slide URL</button>
                )}
              </div>
            )}
          </FeatureGate>
          {(recordReagents ?? []).length > 0 && (
            <FeatureGate feature="REAGENT_TRACKING">
              <div className="mt-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">Reagents Used ({(recordReagents ?? []).length})</div>
                <div className="mt-1.5 flex flex-col gap-1.5">
                  {(recordReagents ?? []).slice(0, 5).map((u: any) => (
                    <div key={u.usageId} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-[#334155]">{u.lot?.name} <span className="font-mono text-[#4F46E5]">{u.lot?.lotNumber}</span></span>
                      {(u.lot?.status === 'Quarantined' || u.lot?.status === 'Recalled') && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ background: '#FEE2E2', color: '#B91C1C' }}>{u.lot.status}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </FeatureGate>
          )}
        </div>
        <div className={`${LABEL} mb-5`}>Patient Stats</div>
        <Stat icon={Activity} label="Total Records" value={String(totalRecords)} unit="cases" />
        <Stat icon={FlaskConical} label="Open Cases" value={String(openCases)} unit="in progress" />
        <Stat icon={Clock} label="Avg TAT" value={avgTat !== null ? `${avgTat}d` : '—'} unit={approvedAt ? 'days TAT' : 'days so far'} />

        <div className="mb-4 mt-1 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Activity Timeline</div>
        <div className="flex flex-col">
          {shownActivity.map((ev: any) => (
            <div key={ev.id} className="flex items-start gap-2.5 border-b border-[#F8FAFC] py-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[ev.status] ?? '#94A3B8' }} />
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-[#0F172A]">{ev.status}</div>
                <div className="truncate text-[13px] text-[#64748B]">{ev.user ? `${ev.user.firstName ?? ''} ${ev.user.lastName ?? ''}`.trim() : 'System'} · {relTime(ev.createdAt)}</div>
              </div>
            </div>
          ))}
          {activity.length === 0 && <div className="text-[13px] text-[#64748B]">No activity yet.</div>}
          {activity.length > 5 && <button onClick={() => setShowAllActivity((v) => !v)} className="mt-2 self-start text-[12px] font-semibold text-[#4F46E5] hover:underline">{showAllActivity ? 'Show less' : `Show more (${activity.length})`}</button>}
        </div>

        <div className="my-4 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Result Sheet</div>
        {!sheet ? (
          <>
            <div className="text-[15px] text-[#64748B]">No result sheet.</div>
            <button onClick={() => setSheetModal(true)} className={`${rightBtn} mt-2`}><FlaskConical size={15} /> Add Result Sheet</button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-bold" style={sheet.authorized ? { background: '#DCFCE7', color: '#16A34A' } : { background: '#EEF3FF', color: '#4F46E5' }}>{sheet.authorized ? <CheckCircle2 size={12} /> : <Clock size={12} />}{sheet.authorized ? 'Authorized' : 'Pending'}</span>
            {sheet.narrative && (
              <div className="text-[14px] leading-relaxed text-[#374151]">
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

        <div className={`${LABEL} mb-3`}>Attachments</div>
        <RecordAttachments recordId={id} />

        <div className="my-4 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Clinical Features</div>
        <button onClick={() => setDrawer(true)} className={rightBtn}><Pencil size={15} /> Edit Clinical Features</button>

        <div className="my-4 border-t border-[#F1F5F9]" />

        <div className={`${LABEL} mb-3`}>Next Steps</div>
        <div className="flex flex-col gap-2">
          <FeatureGate feature="SLIDE_LABEL_PRINTING">
            <button onClick={() => setPrintLabels(true)} className={rightBtn}><Printer size={15} /> Print Labels</button>
          </FeatureGate>
          {status === 'Resulted' && <button onClick={() => router.push('/authorizer')} className={rightBtn}><CheckCircle2 size={15} /> Open Authorizer</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={rightBtn}><FileText size={15} /> Release Report</button>}
          {status === 'Approved' && <button onClick={() => router.push(`/billing?recordId=${id}`)} className={rightBtn}><Receipt size={15} /> Create Invoice</button>}
          {['Billed', 'Paid', 'Viewed'].includes(status) && <button onClick={() => router.push(`/reports?recordId=${id}`)} className={rightBtn}><FileText size={15} /> View Report</button>}
          <button onClick={() => router.push('/records')} className={rightBtn}><ArrowLeft size={15} /> Back to Records</button>
        </div>
      </aside>

      {/* Modals (unchanged) */}
      {record.formType && <RecordFormDrawer open={drawer} onClose={() => { setDrawer(false); refetchAll(); }} formType={record.formType as FormType} recordId={id} />}
      <ResultSheetModal open={sheetModal} onClose={() => { setSheetModal(false); refetchAll(); }} record={record} />
      <AuthorizationModal open={authModal} onClose={() => { setAuthModal(false); refetchAll(); }} record={record} />
      <PriorHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} patientId={record.patientId} excludeRecordId={id} />
      {printLabels && <PrintLabelsModal recordIds={[id]} onClose={() => setPrintLabels(false)} />}
      {addSlideOpen && <AddSlideModal recordId={id} onClose={() => setAddSlideOpen(false)} />}

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
        <div className="text-[14px] font-medium text-[#64748B]">{label}</div>
        <div className="flex items-baseline gap-1.5"><span className="text-[30px] font-bold leading-none text-[#0F172A]">{value}</span><span className="text-[15px] text-[#64748B]">{unit}</span></div>
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
  const Title = ({ children }: any) => <div className="mt-2 text-[24px] font-extrabold italic leading-tight text-[#0F172A]">{children}</div>;
  const Desc = ({ children }: any) => <div className="mt-2 text-[16px] font-medium leading-[1.55] text-[#475569]">{children}</div>;
  const Row = ({ children }: any) => <div className="mt-3.5 flex flex-wrap gap-2.5">{children}</div>;
  const Prim = ({ children, icon, ...rest }: any) => <button {...rest} className={ACTION_BTN} style={PRIM_STYLE}>{icon}<span>{children}</span></button>;
  const Sec = ({ children, icon, ...rest }: any) => <button {...rest} className={ACTION_BTN} style={SEC_STYLE}>{icon}<span>{children}</span></button>;

  switch (status) {
    case 'Pending':
      return (<><Title>Ready to Submit</Title><Desc>Review clinical features and submit this record for processing.</Desc>
        <Row>
          <Prim icon={<Send size={16} />} disabled={pending} onClick={() => go('Submitted', { title: 'Submit for processing?', desc: 'This moves the record into the processing queue.' })}>Submit for Processing</Prim>
        </Row></>);
    case 'Submitted':
      return (<><Title>Awaiting Processing</Title><Desc>Mark this record as in processing when the specimen is received in lab.</Desc>
        <Row>
          <Prim icon={<Play size={16} />} disabled={pending} onClick={() => go('Processing')}>Mark as Processing</Prim>
          <Sec icon={<Pause size={16} />} disabled={pending} onClick={() => go('OnHold')}>Put On Hold</Sec>
        </Row></>);
    case 'Processing':
    case 'Partial':
      return (<><Title>Add Result Sheet</Title><Desc>Enter cytology findings for this specimen.</Desc>
        <Row>
          <Prim icon={<FileText size={16} />} onClick={p.onOpenSheet}>Open Result Sheet</Prim>
          {status === 'Processing' && <Sec icon={<Clock size={16} />} disabled={pending} onClick={() => go('Partial')}>Mark Partial</Sec>}
          <Sec icon={<CheckCircle2 size={16} />} disabled={pending} onClick={() => go('Completed', { title: 'Mark complete?', desc: 'Confirm the result sheet is complete for this record.' })}>Mark Complete</Sec>
        </Row></>);
    case 'Completed':
      return (<><Title>Ready for Review</Title><Desc>Result sheet is complete. Submit for pathologist authorization.</Desc>
        <Row><Prim icon={<ShieldCheck size={16} />} disabled={pending} onClick={() => go('Resulted', { title: 'Submit for authorization?', desc: 'This places the record in the pathologist authorization queue.' })}>Submit for Authorization</Prim></Row></>);
    case 'Resulted':
      return (<><Title>Awaiting Authorization</Title><Desc>This record is in the authorization queue.</Desc>
        <Row><Prim icon={<ShieldCheck size={16} />} onClick={p.onAuthorize}>Authorize Now</Prim>
          <Sec icon={<Users size={16} />} onClick={p.onAuthorizer}>Batch Authorizer</Sec></Row></>);
    case 'Approved':
      return (<><CheckHero /><Title>Approved — Ready to Bill</Title><Desc>Record is authorized. Generate an invoice for the referring client.</Desc>
        <Row><Prim icon={<Receipt size={16} />} onClick={p.onInvoice}>Create Invoice</Prim>
          <Sec icon={<Download size={16} />} onClick={p.onReport}>Download Report</Sec></Row></>);
    case 'Billed':
    case 'Paid':
      return (<><CheckHero /><Title>Billing Complete</Title><Desc>This record has been billed{status === 'Paid' ? ' and paid' : ''}.</Desc>
        <Row><Sec icon={<Download size={16} />} onClick={p.onReport}>Download Report</Sec></Row></>);
    case 'OnHold':
      return (<><Title>Record On Hold</Title><Desc>Resume processing or cancel this record.</Desc>
        <Row><Prim icon={<Play size={16} />} disabled={pending} onClick={() => go('Submitted')}>Resume Processing</Prim>
          <Sec icon={<XCircle size={16} />} disabled={pending} onClick={() => go('Disabled', { title: 'Cancel record?', desc: 'This marks the record as cancelled.' })}>Cancel Record</Sec></Row></>);
    case 'Failed':
    case 'Disabled':
      return (<><Title>Record {status === 'Failed' ? 'Failed' : 'Cancelled'}</Title><Desc>Reopen this record to move it back into processing.</Desc>
        <Row><Prim icon={<RotateCcw size={16} />} disabled={pending} onClick={() => go('Submitted', { title: 'Reopen record?', desc: 'This returns the record to the processing workflow.' })}>Reopen Record</Prim></Row></>);
    default:
      return (<><Title>Complete</Title><Desc>This record has completed its lifecycle.</Desc></>);
  }
}

function CheckHero() {
  return <div className="mb-3 mt-2 grid h-10 w-10 place-items-center rounded-full bg-[#DCFCE7]"><CheckCircle2 size={22} className="text-[#16A34A]" /></div>;
}
