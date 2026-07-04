'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowUpRight, Download, Filter, MoreHorizontal, Plus, Search, Star,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { deriveAge } from '@/lib/age';
import { useFeatures } from '@/lib/feature-context';
import { FeatureGate } from '@/components/FeatureGate';
import { AddCorrelationModal } from '@/components/AddCorrelationModal';
import { RESULT_META as CORR_META, shortDate as corrDate, type CorrelationCase } from '@/lib/correlation';
import { STATUS_META as RECALL_META, dueColor, dueLabel, shortDate as recallDate, type Recall } from '@/lib/recall';

const STAGE: Record<string, { label: string; pct: number }> = {
  Pending: { label: 'Intake', pct: 10 }, Submitted: { label: 'Intake', pct: 25 },
  Processing: { label: 'Processing', pct: 50 }, Partial: { label: 'Processing', pct: 62 },
  Completed: { label: 'Review', pct: 78 }, Resulted: { label: 'Review', pct: 90 },
  Approved: { label: 'Complete', pct: 100 }, Billed: { label: 'Complete', pct: 100 }, Paid: { label: 'Complete', pct: 100 },
};
const OPEN = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
const AUTHORIZED = ['Approved', 'Billed', 'Paid'];
const FINDINGS = ['Approved', 'Billed', 'Paid', 'Resulted'];
const examName = (ft?: string | null) => (ft === 'Gynecology' ? 'Gynecology Cytology' : ft === 'NonGynecology' ? 'Non-Gynecology Cytology' : 'Cytology Examination');
const THUMB_GYN = 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=120&q=80';
const THUMB_NONGYN = 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=120&q=80';
const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
};
const AVATARS = [
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=300&q=80',
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=300&q=80',
  'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=300&q=80',
];

const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : '—');
const typeChip = (ft?: string | null) => (ft === 'Gynecology' ? 'GYN' : ft === 'NonGynecology' ? 'NON-GYN' : 'REC');
const dmy = (d?: string | null) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}/${x.getFullYear()}`;
};
const daysSince = (d?: string | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)) : 0);
const initials = (n: string) => n.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const CARD = 'rounded-[20px] border border-[#EEF2F7] shadow-[0_4px_24px_rgba(0,0,0,0.04),0_1px_4px_rgba(79,70,229,0.06)]';

// Status → badge classes (no orange anywhere).
const statusCls = (s: string) =>
  ['Approved', 'Billed', 'Paid', 'Completed'].includes(s) ? 'bg-[#dcfce7] text-[#16a34a]'
    : ['Processing', 'Partial', 'Resulted'].includes(s) ? 'bg-[#eef2ff] text-[#4f46e5]'
      : ['Failed', 'Disabled'].includes(s) ? 'bg-[#fee2e2] text-[#dc2626]'
        : s === 'OnHold' ? 'bg-[#f1f3f6] text-[#6b7280]'
          : 'bg-[#eaf1ff] text-[#2e5ce6]';
const StatusBadge = ({ s }: { s: string }) => (
  <span className={`inline-flex items-center rounded-[6px] px-2.5 py-[3px] text-[11px] font-bold ${statusCls(s)}`}>{s}</span>
);

interface Rec {
  id: string; labNumber?: string | null; formType?: string | null; status: string; urgent: boolean;
  clinicalDiagnosis?: string | null; specimenDate?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  statusHistory?: Array<{ status: string; createdAt: string; user?: { firstName: string; lastName: string } | null }>;
}

const approvedAt = (r: Rec) => [...(r.statusHistory ?? [])].filter((e) => e.status === 'Approved').sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]?.createdAt;
const turnaround = (r: Rec) => {
  const a = approvedAt(r);
  const end = a ? +new Date(a) : Date.now();
  return Math.max(0, Math.floor((end - +new Date(r.createdAt)) / 86_400_000));
};

/* Completed-finding ring: both rings solid (indigo outer, green inner), TAT centre. */
function FindingRing({ days }: { days: number }) {
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="shrink-0">
      <circle cx={28} cy={28} r={22} fill="none" stroke="#4F46E5" strokeWidth={4} />
      <circle cx={28} cy={28} r={16} fill="none" stroke="#22C55E" strokeWidth={3.5} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">{days}d</text>
    </svg>
  );
}

/* Layered progress ring: outer indigo arc + inner green arc (44px). */
function DualRing({ pct, days, done }: { pct: number; days: number; done: boolean }) {
  const size = 56;
  const r1 = 22;
  const r2 = 16;
  const c1 = 2 * Math.PI * r1;
  const c2 = 2 * Math.PI * r2;
  const p = Math.min(100, Math.max(0, pct));
  const inner = done ? 100 : Math.max(0, p - 20);
  const rot = `rotate(-90 ${size / 2} ${size / 2})`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r1} fill="none" stroke="#eef1f7" strokeWidth={4} />
      <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="#eef1f7" strokeWidth={3.5} />
      <circle cx={size / 2} cy={size / 2} r={r1} fill="none" stroke={done ? '#22c55e' : '#4f46e5'} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={c1} strokeDashoffset={c1 * (1 - p / 100)} transform={rot} />
      <circle cx={size / 2} cy={size / 2} r={r2} fill="none" stroke="#22c55e" strokeWidth={3.5} strokeLinecap="round"
        strokeDasharray={c2} strokeDashoffset={c2 * (1 - inner / 100)} transform={rot} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">{done ? '✓' : `${days}d`}</text>
    </svg>
  );
}

function Stat({ value, unit, label }: { value: React.ReactNode; unit: string; label: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">{label}</div>
      <div className="mt-0.5 leading-none">
        <span className="text-[28px] font-bold text-[#111827]">{value}</span>
        <span className="ml-1 text-[13px] text-[#9CA3AF]">{unit}</span>
      </div>
    </div>
  );
}

function SkelCard({ h }: { h: number }) {
  return <div className={`animate-pulse bg-[#eef2f8] ${CARD}`} style={{ height: h }} />;
}

export default function PatientProfilePage() {
  const router = useRouter();
  const id = useParams<{ id: string }>().id;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [expandedExamId, setExpandedExamId] = useState<string | null>(null);
  const [starred, setStarred] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [addCorr, setAddCorr] = useState(false);
  const { isEnabled } = useFeatures();
  useEffect(() => {
    const t = setInterval(() => setCurrentIdx((i) => (i + 1) % AVATARS.length), 4000);
    return () => clearInterval(t);
  }, []);

  const { data: recalls = [] } = useQuery<Recall[]>({
    queryKey: ['patient-recalls', id],
    queryFn: () => api.get(`/recalls/patient/${id}`).then((r) => r.data),
    enabled: isEnabled('PATIENT_RECALL'),
  });
  const { data: correlations = [] } = useQuery<CorrelationCase[]>({
    queryKey: ['correlations-patient', id], enabled: !!id && isEnabled('CORRELATION_TRACKING'),
    queryFn: () => api.get(`/correlation/patient/${id}`).then((r) => r.data),
  });

  // — fetches (unchanged) —
  const { data: patient, isLoading: pl } = useQuery<any>({
    queryKey: ['patient', id], enabled: !!id,
    queryFn: () => api.get(`/patient/${id}`).then((r) => r.data),
  });
  const { data: history, isLoading: hl } = useQuery<Paginated<Rec>>({
    queryKey: ['patient-records', id], enabled: !!id,
    queryFn: () => api.get('/specimens/patient', { params: { patientId: id, pageSize: 50 } }).then((r) => r.data),
  });

  const rows = useMemo(
    () => [...(history?.data ?? [])].sort((a, b) => +new Date(b.specimenDate ?? b.createdAt) - +new Date(a.specimenDate ?? a.createdAt)),
    [history],
  );
  const latest = rows[0];
  const openRecs = rows.filter((r) => OPEN.includes(r.status));
  const authorized = rows.filter((r) => AUTHORIZED.includes(r.status));
  const findings = rows.filter((r) => FINDINGS.includes(r.status)).slice(0, 3);
  const exams = rows.slice(0, 5);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    const name = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
    return rows.filter((r) => (r.labNumber ?? '').toLowerCase().includes(s) || name.includes(s));
  }, [rows, q, patient]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const pageRows = filtered.slice((page - 1) * 10, page * 10);

  const doctor = (r: Rec) => {
    const withUser = [...(r.statusHistory ?? [])].reverse().find((e) => e.user);
    return withUser?.user ? `${withUser.user.firstName} ${withUser.user.lastName}`.trim() : '—';
  };

  if (pl || hl || !patient) {
    return (
      <div className="-m-4 min-h-full p-6 md:-m-8 md:p-8" style={{ background: '#F8FAFC' }}>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_300px]">
          <SkelCard h={240} /><SkelCard h={240} /><SkelCard h={420} /><SkelCard h={420} />
        </div>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const age = deriveAge(patient.dateOfBirth);
  const diagnosis = latest?.clinicalDiagnosis || (latest?.formType ? (latest.formType === 'Gynecology' ? 'Gyn' : 'Non-Gyn') : '—');
  const iconBtn = 'grid h-9 w-9 place-items-center rounded-full transition-colors';

  return (
    <div className="-m-4 min-h-full p-6 md:-m-8 md:p-8" style={{ background: '#F8FAFC' }}>
      {/* Back bar */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back" className={`${iconBtn} border border-[#EEF2F7] bg-white text-[#6b7280] hover:text-[#111827]`}><ArrowLeft size={18} /></button>
        <span className="text-[14px] font-semibold text-[#6b7280]">Patients / <span className="text-[#111827]">{fullName}</span></span>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_300px]">
        {/* ══ HERO ══ */}
        <section className={`relative overflow-hidden ${CARD}`} style={{ background: '#EEF3FF', minHeight: 260 }}>
          {/* photo — single image, cycles every 4s */}
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '45%', overflow: 'hidden', zIndex: 1 }}>
            <Image key={currentIdx} src={AVATARS[currentIdx]} alt="" fill unoptimized sizes="45vw" style={{ objectFit: 'cover', objectPosition: 'top center' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 120, zIndex: 2, background: 'linear-gradient(to right, #EEF3FF 0%, transparent 100%)' }} />
          </div>

          {/* label (top-left) */}
          <span style={{ position: 'absolute', top: 24, left: 28, zIndex: 3 }} className="text-[12px] font-medium leading-tight text-[#6B7280]">Patient<br />profile</span>

          {/* star + more (top-right) */}
          <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 3 }} className="flex items-center gap-2">
              <button aria-label="Star" onClick={() => setStarred((v) => !v)} className={`${iconBtn} bg-white/80 ${starred ? 'text-[#4f46e5]' : 'text-[#6b7280] hover:text-[#111827]'}`}>
                <Star size={16} fill={starred ? '#4f46e5' : 'none'} />
              </button>
              <button aria-label="More" onClick={() => setMenuOpen((v) => !v)} className={`${iconBtn} bg-white/80 text-[#6b7280] hover:text-[#111827]`}><MoreHorizontal size={16} /></button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-xl border border-[#EEF2F7] bg-white py-1 shadow-lg">
                    {['Edit patient', 'Print profile', 'Archive'].map((m) => (
                      <button key={m} onClick={() => setMenuOpen(false)} className="block w-full px-4 py-2 text-left text-[13px] font-medium text-[#374151] hover:bg-[#f5f7fd]">{m}</button>
                    ))}
                  </div>
                </>
              )}
          </div>

          {/* left content */}
          <div style={{ position: 'absolute', bottom: 24, left: 28, zIndex: 2 }}>
            <div className="flex gap-8">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Treatment phase</div>
                <div className="mt-0.5 text-[15px] font-semibold text-[#111827]">{latest ? STAGE[latest.status]?.label ?? '—' : '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">Diagnosis</div>
                <div className="mt-0.5 text-[15px] font-semibold text-[#111827]">{diagnosis}</div>
              </div>
            </div>
            <div className="mt-5 flex items-center">
              <Stat value={rows.length} unit="rec" label="Total records" />
              <div style={{ width: 1, height: 32, background: '#D1D5DB', alignSelf: 'center', margin: '0 8px' }} />
              <Stat value={openRecs.length} unit="open" label="Open cases" />
              <div style={{ width: 1, height: 32, background: '#D1D5DB', alignSelf: 'center', margin: '0 8px' }} />
              <Stat value={authorized.length} unit="auth" label="Authorized" />
            </div>
          </div>

          {/* name + age/sex */}
          <div style={{ position: 'absolute', bottom: 24, right: 'calc(45% + 16px)', zIndex: 3, textAlign: 'right' }}>
            <div className="text-[20px] font-bold text-[#111827]">{fullName}</div>
            <div className="text-[14px] text-[#6B7280]">{age != null ? `${age} years old` : 'Age —'}, {patient.gender ?? '—'}</div>
          </div>
        </section>

        {/* ══ CURRENT FINDINGS ══ */}
        <section className={`flex flex-col bg-white p-5 ${CARD}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-[#111827]">Current findings</h2>
            <div className="flex items-center gap-2">
              <button aria-label="Add" className={`${iconBtn} border border-[#EEF2F7] text-[#6b7280] hover:text-[#111827]`}><Plus size={16} /></button>
              <button onClick={() => router.push('/records')} aria-label="Open" className={`${iconBtn} bg-[#4f46e5] text-white hover:bg-[#4338ca]`}><ArrowUpRight size={16} /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {findings.length === 0 && <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No completed findings yet</div>}
            {findings.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-[14px] border border-[#EEF2F7] p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-[#111827]">{r.clinicalDiagnosis || (r.specimens?.[0]?.type ? specLabel(r.specimens[0].type) : examName(r.formType))}</div>
                  <div className="mt-2 flex gap-6">
                    <div className="space-y-0.5">
                      <div className="text-[12px] text-[#9CA3AF]">Received – {dmy(r.specimenDate ?? r.createdAt)}</div>
                      <div className="text-[12px] text-[#9CA3AF]">Reported – {dmy(approvedAt(r))}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-mono text-[12px] text-[#6b7280]">{r.labNumber ?? '—'}</div>
                      <div className={`text-[12px] font-semibold ${r.urgent ? 'text-[#dc2626]' : 'text-[#374151]'}`}>{r.urgent ? 'Urgent' : r.status}</div>
                    </div>
                  </div>
                </div>
                <FindingRing days={turnaround(r)} />
              </div>
            ))}
          </div>
        </section>

        {/* ══ RECORD HISTORY ══ */}
        <section className={`flex flex-col bg-white ${CARD}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h2 className="text-[18px] font-bold text-[#111827]">Record History</h2>
            <div className="flex items-center gap-2">
              <div className="flex h-10 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 text-[#9CA3AF]">
                <Search size={16} />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search.." className="w-32 border-none bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]" />
              </div>
              <button aria-label="Filter" className={`h-10 w-10 ${iconBtn} border border-[#E5E7EB] text-[#6b7280] hover:text-[#111827]`}><Filter size={16} /></button>
              <button aria-label="Add" className="grid h-10 w-10 place-items-center rounded-full bg-[#4f46e5] text-white hover:bg-[#4338ca]"><Plus size={17} /></button>
            </div>
          </div>

          <div className="overflow-x-auto px-4 pb-2 pt-4">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-[#F3F4F6] text-left text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                  <th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Lab#</th><th className="px-3 py-2.5">Specimen</th>
                  <th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Doctor</th><th className="w-10 px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-[#9CA3AF]">No records found.</td></tr>}
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]">
                    <td className="px-3 py-3 text-[13px] text-[#6b7280]">{new Date(r.specimenDate ?? r.createdAt).toLocaleDateString()}</td>
                    <td className="px-3 py-3"><span className={`font-mono text-[13px] ${r.labNumber ? 'font-semibold text-[#111827]' : 'text-[#9CA3AF]'}`}>{r.labNumber ?? '—'}</span></td>
                    <td className="px-3 py-3 text-[13px] text-[#6b7280]">{specLabel(r.specimens?.[0]?.type) !== '—' ? specLabel(r.specimens?.[0]?.type) : <span className="rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-bold text-[#4f46e5]">{typeChip(r.formType)}</span>}</td>
                    <td className="px-3 py-3"><StatusBadge s={r.status} /></td>
                    <td className="px-3 py-3 text-[13px] text-[#6b7280]">{STAGE[r.status]?.label ?? '—'}</td>
                    <td className="px-3 py-3 text-[13px] text-[#6b7280]">{doctor(r)}</td>
                    <td className="px-2 py-3"><button onClick={() => router.push(`/records/${r.id}`)} aria-label="Open record" className="grid h-8 w-8 place-items-center rounded-full text-[#9CA3AF] hover:bg-[#eef2ff] hover:text-[#4f46e5]"><Download size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 pb-5 pt-2">
            <span className="text-[12px] text-[#9CA3AF]">{filtered.length} records</span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] disabled:opacity-30 hover:bg-[#f1f3f6]">←</button>
              {Array.from({ length: pageCount }).map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)} className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-[13px] font-semibold ${page === i + 1 ? 'bg-[#4f46e5] text-white' : 'text-[#6b7280] hover:bg-[#f1f3f6]'}`}>{i + 1}</button>
              ))}
              <button disabled={page === pageCount} onClick={() => setPage((p) => p + 1)} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] disabled:opacity-30 hover:bg-[#f1f3f6]">→</button>
            </div>
          </div>
        </section>

        {/* ══ CORRELATIONS (cyto-histo) ══ */}
        <FeatureGate feature="CORRELATION_TRACKING">
          <section className={`flex flex-col p-5 ${CARD}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#111827]">Correlations</h2>
              <button onClick={() => setAddCorr(true)} className="flex items-center gap-1.5 rounded-lg bg-[#4F46E5] px-3 py-1.5 text-[13px] font-semibold text-white"><Plus size={14} /> Add</button>
            </div>
            {correlations.length === 0 ? (
              <div className="py-4 text-[13px] text-[#9CA3AF]">No cyto-histo correlations for this patient.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {correlations.map((c) => (
                  <button key={c.id} onClick={() => router.push(`/correlation/${c.id}`)} className="flex items-center justify-between rounded-xl border border-[#EEF2F7] px-3.5 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]"
                    style={{ background: c.correlationResult === 'MajorDiscordant' ? CORR_META.MajorDiscordant.rowBg : undefined }}>
                    <div>
                      <div className="text-[13px] font-semibold text-[#0F172A]">{c.cytologyDiagnosis} → {c.histologyDiagnosis ?? 'pending histology'}</div>
                      <div className="text-[12px] text-[#94A3B8]">Cyto {corrDate(c.cytologyDate)}{c.histologyDate ? ` · Histo ${corrDate(c.histologyDate)}` : ''}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: CORR_META[c.correlationResult ?? 'Unresolved'].bg, color: CORR_META[c.correlationResult ?? 'Unresolved'].fg }}>{CORR_META[c.correlationResult ?? 'Unresolved'].label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </FeatureGate>

        {/* ══ RECALLS (scheduled follow-up) ══ */}
        <FeatureGate feature="PATIENT_RECALL">
          <section className={`flex flex-col p-5 ${CARD}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#111827]">Recalls</h2>
              <button onClick={() => router.push('/recalls')} className="text-[13px] font-semibold text-[#4F46E5] hover:underline">View all →</button>
            </div>
            {recalls.length === 0 ? (
              <div className="py-4 text-[13px] text-[#9CA3AF]">No recalls scheduled for this patient.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {recalls.map((r) => (
                  <button key={r.id} onClick={() => router.push('/recalls')} className="flex items-center justify-between rounded-xl border border-[#EEF2F7] px-3.5 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]" style={{ background: RECALL_META[r.status].rowBg }}>
                    <div>
                      <div className="text-[13px] font-semibold text-[#0F172A]">{r.triggerDiagnosis} · {r.recallIntervalMonths}mo</div>
                      <div className="text-[12px]" style={{ color: dueColor(r.daysUntilDue) }}>Due {recallDate(r.dueDate)}{['Pending', 'Due', 'Overdue'].includes(r.status) ? ` · ${dueLabel(r.daysUntilDue)}` : ''}</div>
                    </div>
                    <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: RECALL_META[r.status].bg, color: RECALL_META[r.status].fg }}>{RECALL_META[r.status].label}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </FeatureGate>

        {/* ══ CURRENT EXAMINATIONS ══ */}
        <section className={`flex flex-col p-5 ${CARD}`} style={{ background: '#F0F0FF' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-bold text-[#111827]">Current examinations</h2>
            <button aria-label="Add examination" className="grid h-8 w-8 place-items-center rounded-full bg-[#111827] text-white hover:bg-black"><Plus size={16} /></button>
          </div>
          <div className="mt-3 flex flex-col">
            {exams.length === 0 && <div className="py-8 text-center text-[13px] text-[#9CA3AF]">No examinations yet.</div>}
            {exams.map((r) => {
              const open = expandedExamId === r.id;
              const nongyn = r.formType === 'NonGynecology';
              const thumb = nongyn ? THUMB_NONGYN : THUMB_GYN;
              const tint = nongyn ? '#EEF3FF' : '#FFF0F5';
              const clientNm = r.client ? (r.client.officeName || `${r.client.firstName} ${r.client.lastName}`.trim()) : 'Lab';
              const clientInit = (r.client?.officeName?.[0] ?? r.client?.firstName?.[0] ?? 'L').toUpperCase();
              return (
                <div key={r.id} className="border-b py-3.5 last:border-b-0" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-[14px] font-bold text-[#111827]">{examName(r.formType)}</div>
                    <button aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setExpandedExamId(open ? null : r.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-[#4f46e5] shadow-sm"
                      style={{ transform: open ? 'rotate(45deg)' : 'none', transition: 'transform .15s ease' }}>
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6b7280]">{dmy(r.specimenDate ?? r.createdAt)} · <StatusBadge s={r.status} /></div>
                  {open && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                        {[0, 1, 2].map((i) => (
                          <div key={i} style={{ width: 54, height: 54, borderRadius: 10, overflow: 'hidden', position: 'relative', background: tint, flexShrink: 0 }}>
                            <Image src={thumb} alt="" fill unoptimized sizes="54px" style={{ objectFit: 'cover' }} />
                          </div>
                        ))}
                        <button onClick={() => router.push(`/records/${r.id}`)} style={{ flex: 1, minWidth: 60, background: '#111827', color: 'white', borderRadius: 10, fontSize: 11, fontWeight: 600, lineHeight: 1.2, border: 'none', cursor: 'pointer' }}>Open full list</button>
                      </div>
                      <div style={{ marginTop: 8, background: '#F5F5FF', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4F46E5', color: 'white', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{clientInit}</div>
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: '#374151', flex: 1 }}>{clientNm}</span>
                        <span style={{ color: '#9CA3AF' }}>›</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {addCorr && <AddCorrelationModal defaultPatientId={id} onClose={() => setAddCorr(false)} />}
    </div>
  );
}
