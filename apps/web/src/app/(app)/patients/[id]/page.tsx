'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Skeleton } from 'antd';
import {
  ArrowLeft, ArrowUpRight, Download, FileText, MoreHorizontal, Plus, Search, Star,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api, type Paginated } from '@/lib/api';
import { deriveAge } from '@/lib/age';

const STAGE: Record<string, { label: string; pct: number }> = {
  Pending: { label: 'Intake', pct: 10 }, Submitted: { label: 'Intake', pct: 25 },
  Processing: { label: 'Processing', pct: 50 }, Partial: { label: 'Processing', pct: 62 },
  Completed: { label: 'Review', pct: 78 }, Resulted: { label: 'Review', pct: 90 },
  Approved: { label: 'Complete', pct: 100 }, Billed: { label: 'Complete', pct: 100 }, Paid: { label: 'Complete', pct: 100 },
};
const OPEN = ['Pending', 'Submitted', 'Processing', 'Partial', 'Completed', 'Resulted'];
const FINDINGS = ['Approved', 'Resulted'];
const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
};
const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : '—');
const dateFmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const daysSince = (d?: string | null) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)) : 0);
const initials = (n: string) => n.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const typeChip = (ft?: string | null) => (ft === 'Gynecology' ? 'Gyn' : ft === 'NonGynecology' ? 'Non-Gyn' : 'Record');

// Status → badge colours. No orange/amber anywhere: OnHold falls back to neutral gray.
const statusCls = (s: string) =>
  ['Approved', 'Billed', 'Paid', 'Completed'].includes(s) ? 'bg-success-soft text-success'
    : ['Failed', 'Disabled'].includes(s) ? 'bg-danger-soft text-danger'
      : s === 'OnHold' ? 'bg-lightgray text-text-secondary'
        : 'bg-primary-soft text-primary';
const StatusBadge = ({ s }: { s: string }) => <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-bold ${statusCls(s)}`}>{s}</span>;

interface Rec {
  id: string; labNumber?: string | null; formType?: string | null; status: string; urgent: boolean;
  specimenDate?: string | null; createdAt: string;
  patient?: { firstName: string; lastName: string } | null;
  client?: { firstName: string; lastName: string; officeName?: string | null; accountNo?: string | null } | null;
  specimens?: Array<{ id: string; type: string }>;
  statusHistory?: Array<{ status: string; createdAt: string; user?: { firstName: string; lastName: string } | null }>;
}

function Ring({ pct, label }: { pct: number; label: string }) {
  const size = 50, sw = 5, r = (size - sw) / 2, c = 2 * Math.PI * r;
  const done = pct >= 100;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f7df9" /><stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf4" strokeWidth={sw} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={done ? '#22c55e' : 'url(#ringGrad)'} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dy="0.35em" textAnchor="middle" fontSize="12" fontWeight="800" fill="#0f172a">{label}</text>
    </svg>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption font-semibold uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="mt-0.5 text-[15px] font-bold text-text">{value}</div>
    </div>
  );
}

export default function PatientProfilePage() {
  const router = useRouter();
  const id = useParams<{ id: string }>().id;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>();
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string>();

  const { data: patient, isLoading: pl } = useQuery<any>({
    queryKey: ['patient', id], enabled: !!id,
    queryFn: () => api.get(`/patient/${id}`).then((r) => r.data),
  });
  const { data: history, isLoading: hl } = useQuery<Paginated<Rec>>({
    queryKey: ['patient-records', id], enabled: !!id,
    queryFn: () => api.get('/specimens/patient', { params: { patientId: id, pageSize: 50 } }).then((r) => r.data),
  });

  const rows = history?.data ?? [];
  const clientName = (c: any) => (c ? c.officeName || `${c.firstName} ${c.lastName}`.trim() : null);
  // Hero client: the patient's linked client, else the referring client on their records.
  const heroClient = patient?.client ? clientName(patient.client) : clientName(rows[0]?.client) ?? '—';

  const openRecs = rows.filter((r) => OPEN.includes(r.status)).slice(0, 5);
  const openTotal = rows.filter((r) => OPEN.includes(r.status)).length;
  const findings = rows.filter((r) => FINDINGS.includes(r.status))
    .sort((a, b) => +new Date(b.specimenDate ?? b.createdAt) - +new Date(a.specimenDate ?? a.createdAt)).slice(0, 4);

  const filtered = useMemo(() => {
    let list = rows;
    if (status) list = list.filter((r) => r.status === status);
    if (q) {
      const s = q.toLowerCase();
      const name = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
      list = list.filter((r) => (r.labNumber ?? '').toLowerCase().includes(s) || name.includes(s));
    }
    return list;
  }, [rows, status, q, patient]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const pageRows = filtered.slice((page - 1) * 10, page * 10);

  const pathologist = (r: Rec) => {
    const withUser = [...(r.statusHistory ?? [])].reverse().find((e) => e.user);
    return withUser?.user ? `${withUser.user.firstName} ${withUser.user.lastName}`.trim() : '—';
  };

  if (pl || hl || !patient) {
    return (
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 xl:col-span-8"><div className="h-[220px] rounded-card bg-[#eef3ff] p-6"><Skeleton active paragraph={{ rows: 3 }} /></div></div>
        <div className="col-span-12 xl:col-span-4"><div className="h-[220px] rounded-card border border-card bg-surface p-6 shadow-card"><Skeleton active paragraph={{ rows: 3 }} /></div></div>
        <div className="col-span-12 xl:col-span-8"><div className="rounded-card border border-card bg-surface p-6 shadow-card"><Skeleton active paragraph={{ rows: 8 }} /></div></div>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const age = deriveAge(patient.dateOfBirth);

  return (
    <div className="flex flex-col gap-6">
      {/* Back bar */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full border border-card bg-surface text-text-secondary hover:text-text"><ArrowLeft size={18} /></button>
        <span className="text-small font-semibold text-text-secondary">Patients / <span className="text-text">{fullName}</span></span>
      </div>

      <div className="grid grid-cols-12 items-start gap-6">
        {/* ===== HERO ===== */}
        <section className="relative col-span-12 overflow-hidden rounded-card bg-[#eef3ff] p-6 xl:col-span-8" style={{ minHeight: 220 }}>
          <div className="flex items-start justify-between">
            <span className="text-caption font-bold uppercase tracking-wide text-text-tertiary">Patient profile</span>
            <div className="flex items-center gap-2">
              <button aria-label="Star" className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-text-secondary hover:text-primary"><Star size={16} /></button>
              <button aria-label="More" className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-text-secondary hover:text-text"><MoreHorizontal size={16} /></button>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-6">
            {/* Info grid */}
            <div className="grid flex-1 grid-cols-3 gap-x-8 gap-y-5">
              <Info label="Registration" value={patient.registrationNo ?? '—'} />
              <Info label="Client" value={heroClient} />
              <Info label="Blood Group" value={patient.bloodGroup ?? '—'} />
              <Info label="Date of Birth" value={dateFmt(patient.dateOfBirth)} />
              <Info label="Gender" value={patient.gender ?? '—'} />
              <Info label="Weight" value={patient.weight ? `${patient.weight} kg` : '—'} />
            </div>

            {/* Avatar + name */}
            <div className="flex shrink-0 flex-col items-center gap-2.5">
              {patient.avatarUrl
                ? <img src={patient.avatarUrl} alt={fullName} className="h-24 w-24 rounded-full object-cover ring-4 ring-white" />
                : <div className="grid h-24 w-24 place-items-center rounded-full bg-primary text-[30px] font-extrabold text-white ring-4 ring-white">{initials(fullName)}</div>}
              <div className="text-center">
                <div className="text-[18px] font-extrabold leading-tight text-text">{fullName}</div>
                <div className="text-small font-semibold text-text-secondary">{age != null ? `${age} yrs` : 'Age —'} · {patient.gender ?? '—'}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== OPEN REQUISITIONS ===== */}
        <section className="col-span-12 flex flex-col rounded-card border border-card bg-gradient-to-b from-white to-[#f5f7fd] p-5 shadow-card xl:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold tracking-tight text-text">Open requisitions</h2>
            <div className="flex items-center gap-2">
              <button aria-label="Add" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-white hover:bg-primary-hover"><Plus size={16} /></button>
              <button onClick={() => router.push('/records')} aria-label="Open" className="grid h-9 w-9 place-items-center rounded-full border border-card text-text-secondary hover:text-text"><ArrowUpRight size={16} /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-col divide-y divide-border">
            {openRecs.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No open requisitions.</div>}
            {openRecs.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-small font-bold text-text">{r.labNumber ?? '—'}</span>
                    <span className="shrink-0 rounded-pill bg-primary-soft px-2 py-0.5 text-tiny font-bold text-primary">{typeChip(r.formType)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-caption font-medium text-text-secondary">
                    {r.urgent ? 'Urgent' : specLabel(r.specimens?.[0]?.type)} · {dateFmt(r.specimenDate ?? r.createdAt)}
                  </div>
                </div>
                <Ring pct={STAGE[r.status]?.pct ?? 0} label={`${daysSince(r.specimenDate ?? r.createdAt)}d`} />
              </div>
            ))}
          </div>
          {openTotal > openRecs.length && (
            <button onClick={() => router.push('/records')} className="mt-3 text-caption font-bold text-primary hover:underline">View all {openTotal}</button>
          )}
        </section>

        {/* ===== RECORD HISTORY ===== */}
        <section className="col-span-12 flex flex-col rounded-card border border-card bg-gradient-to-b from-white to-[#f5f7fd] shadow-card xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h2 className="text-[20px] font-extrabold tracking-tight text-text">Record History · {filtered.length}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-10 items-center gap-2 rounded-pill border border-card bg-surface px-3 text-text-tertiary">
                <Search size={16} />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search records" className="w-36 border-none bg-transparent text-small text-text outline-none placeholder:text-text-tertiary" />
              </div>
              <div className="relative">
                <select value={status ?? ''} onChange={(e) => { setStatus(e.target.value || undefined); setPage(1); }}
                  className="h-10 appearance-none rounded-pill border border-card bg-surface pl-3.5 pr-8 text-small font-medium text-text outline-none focus:border-primary">
                  <option value="">Status</option>
                  {Object.keys(STAGE).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button aria-label="Add" className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white hover:bg-primary-hover"><Plus size={17} /></button>
            </div>
          </div>

          <div className="overflow-x-auto px-2 pb-4 pt-3">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="text-left text-caption font-bold uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Lab#</th><th className="px-4 py-3">Specimen</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Pathologist</th><th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-small text-text-tertiary">No records found.</td></tr>}
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-[#f8fafd]">
                    <td className="px-4 py-3"><span className="text-small font-medium text-text-secondary">{dateFmt(r.specimenDate ?? r.createdAt)}</span></td>
                    <td className="px-4 py-3"><span className="text-small font-bold text-text">{r.labNumber ?? '—'}</span></td>
                    <td className="px-4 py-3"><span className="text-small font-medium text-text-secondary">{specLabel(r.specimens?.[0]?.type)}</span></td>
                    <td className="px-4 py-3"><StatusBadge s={r.status} /></td>
                    <td className="px-4 py-3"><span className="text-small font-semibold text-text-secondary">{STAGE[r.status]?.label ?? '—'}</span></td>
                    <td className="px-4 py-3"><span className="text-small font-medium text-text-secondary">{pathologist(r)}</span></td>
                    <td className="px-2 py-3"><button aria-label="Download report" title="Download report" className="grid h-8 w-8 place-items-center rounded-full text-text-tertiary hover:bg-primary-soft hover:text-primary"><Download size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between px-6 pb-5 pt-1">
              <span className="text-caption font-medium text-text-tertiary">Page {page} of {pageCount}</span>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-pill border border-card px-3 py-1.5 text-caption font-bold text-text-secondary disabled:opacity-40 hover:text-text">Prev</button>
                <button disabled={page === pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-pill border border-card px-3 py-1.5 text-caption font-bold text-text-secondary disabled:opacity-40 hover:text-text">Next</button>
              </div>
            </div>
          )}
        </section>

        {/* ===== RECENT FINDINGS ===== */}
        <section className="col-span-12 flex flex-col rounded-card p-5 xl:col-span-4" style={{ background: '#f0f0ff' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold tracking-tight text-text">Recent findings</h2>
            <button aria-label="Add finding" className="grid h-9 w-9 place-items-center rounded-full bg-text text-white hover:bg-text/90"><Plus size={16} /></button>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {findings.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">No findings yet.</div>}
            {findings.map((r) => {
              const open = expanded === r.id;
              return (
                <div key={r.id} className="rounded-control bg-white/70 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-small font-bold text-text">{r.labNumber ?? '—'}</div>
                      <div className="truncate text-caption font-medium text-text-secondary">{dateFmt(r.specimenDate ?? r.createdAt)} · {r.status}</div>
                    </div>
                    <button aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setExpanded(open ? undefined : r.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary transition-transform"
                      style={{ transform: open ? 'rotate(45deg)' : 'none' }}><Plus size={16} /></button>
                  </div>
                  {open && (
                    <div className="mt-3 border-t border-[#e3e3f5] pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(r.specimens ?? []).length === 0 && <span className="text-caption text-text-tertiary">No specimens</span>}
                        {(r.specimens ?? []).map((s) => <span key={s.id} className="rounded-pill bg-primary-soft px-2.5 py-1 text-tiny font-bold text-primary">{specLabel(s.type)}</span>)}
                      </div>
                      <button onClick={() => router.push('/records')} className="mt-3 flex items-center gap-1.5 text-caption font-bold text-primary hover:underline"><FileText size={14} /> View report</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
