'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Skeleton, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRight, ArrowUpRight, BarChart3, Clock, FlaskConical, MoreHorizontal, Plus, Search, SlidersHorizontal,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AvatarStack } from '@/components/ui';
import { PatientFormDrawer } from '@/components/PatientFormDrawer';

const APPROVED = ['Approved', 'Billed', 'Paid'];
const SPECIMEN: Record<string, string> = {
  ENDOCERV_ASP: 'Endocervical asp.', CERV_SCRAP: 'Cervical scrape', VAG_POOL: 'Vaginal pool', URINE: 'Urine cytology',
  CSF: 'CSF', PLEURAL_FLD: 'Pleural fluid', BREAST_ASP: 'Breast asp.', JOINT_ASP: 'Joint asp.', SYNOVIAL_FLD: 'Synovial fluid', OTHER: 'Other',
};
const specLabel = (t?: string | null) => (t ? SPECIMEN[t] ?? t : '—');
const time = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const longDate = (d: string) => new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening'; };

function StatusChip({ status, urgent }: { status: string; urgent: boolean }) {
  const [label, cls] = urgent
    ? ['Urgent', 'bg-danger-soft text-danger']
    : APPROVED.includes(status)
      ? ['Authorized', 'bg-success-soft text-success']
      : ['Pending', 'bg-primary-soft text-primary'];
  return <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-caption font-bold ${cls}`}>{label}</span>;
}

export default function PatientsPage() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [q, setQ] = useState('');

  const { data: d, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients-overview'],
    queryFn: () => api.get('/patients/overview').then((r) => r.data),
  });

  const rows = useMemo(() => {
    const list = d?.records ?? [];
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter((r: any) => r.patient.toLowerCase().includes(s) || specLabel(r.specimenType).toLowerCase().includes(s) || (r.labNumber ?? '').toLowerCase().includes(s));
  }, [d, q]);

  if (isError) return <div className="p-2 text-small text-text-secondary">The daily queue is unavailable right now.</div>;
  if (isLoading || !d) return <PageSkeleton />;

  const columns: ColumnsType<any> = [
    {
      title: 'Patient', dataIndex: 'patient',
      render: (_, r) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-caption font-bold text-primary">
            {r.patient.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
          </span>
          <div className="min-w-0">
            <div className="truncate text-small font-bold text-text">{r.patient}</div>
            <div className="truncate text-caption font-medium text-text-tertiary">{r.labNumber ?? '—'}</div>
          </div>
        </div>
      ),
    },
    { title: 'Specimen type', dataIndex: 'specimenType', render: (t) => <span className="text-small font-medium text-text-secondary">{specLabel(t)}</span> },
    { title: 'Status', dataIndex: 'status', width: 130, render: (_, r) => <StatusChip status={r.status} urgent={r.urgent} /> },
    { title: 'Received', dataIndex: 'receivedAt', width: 130, render: (v) => <span className="text-small font-medium text-text-secondary">{time(v)}</span> },
    {
      title: 'Stage', dataIndex: 'stage', width: 190,
      render: (st) => (
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-24 overflow-hidden rounded-pill bg-lightgray">
            <div className="h-full rounded-pill bg-gradient-to-r from-primary to-[#2e5ce6]" style={{ width: `${st.pct}%` }} />
          </div>
          <span className="whitespace-nowrap text-caption font-semibold text-text-secondary">{st.label}</span>
        </div>
      ),
    },
    { title: '', width: 44, render: () => <button className="text-text-tertiary hover:text-text"><MoreHorizontal size={18} /></button> },
  ];

  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      {/* ===== LEFT PANEL — today's queue ===== */}
      <aside className="flex w-full shrink-0 flex-col self-start rounded-card border border-card bg-gradient-to-b from-white to-[#f5f7fd] p-5 shadow-card xl:sticky xl:top-0 xl:w-[340px]">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-caption font-semibold uppercase tracking-wide text-text-tertiary">{longDate(d.today.dateISO)}</div>
            <div className="mt-0.5 text-[19px] font-extrabold tracking-tight text-text">{d.today.requisitionsToday} requisitions today</div>
          </div>
          <button onClick={() => setDrawerOpen(true)} aria-label="New requisition" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-card transition-colors hover:bg-primary-hover"><Plus size={20} /></button>
        </div>

        {/* Featured open case */}
        {d.featured && (
          <div className="mt-4 rounded-control border border-[#e3e9f6] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[16px] font-extrabold text-text">{d.featured.patient}</span>
              <span className="shrink-0 rounded-pill bg-primary-soft px-2 py-0.5 text-caption font-bold text-primary">{d.featured.formType}</span>
            </div>
            <div className="mt-0.5 text-small font-semibold text-primary">{d.featured.client ?? 'Walk-in'}</div>
            <div className="mt-3 flex items-center justify-between text-small">
              <span className="font-semibold text-primary">{specLabel(d.featured.specimenLabel) === '—' ? d.featured.specimenLabel : specLabel(d.featured.specimenLabel)}</span>
              <span className="font-semibold text-primary">{d.featured.status}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-caption font-medium text-text-tertiary"><Clock size={13} /> Collected {time(d.featured.collectedAt)}</div>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => router.push('/records')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-control bg-primary text-small font-bold text-white transition-colors hover:bg-primary-hover">Begin Processing <ArrowRight size={16} /></button>
              <button aria-label="Schedule" className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-card text-text-secondary hover:text-text"><Clock size={18} /></button>
            </div>
          </div>
        )}

        {/* Today's requisition list */}
        <div className="mt-5 text-caption font-bold uppercase tracking-wide text-text-tertiary">Today&apos;s queue</div>
        <div className="premium-scroll mt-2 flex flex-col divide-y divide-border overflow-y-auto pr-1" style={{ maxHeight: 460 }}>
          {d.queue.length === 0 && <div className="py-6 text-center text-small text-text-tertiary">Queue is clear.</div>}
          {d.queue.map((it: any) => (
            <button key={it.id} onClick={() => router.push('/records')} className="flex items-center gap-3 py-3 text-left first:pt-0">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary"><FlaskConical size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-small font-bold text-text">{it.patient}</div>
                <div className="truncate text-caption font-semibold text-primary">{specLabel(it.diagnosis) === '—' ? it.diagnosis : specLabel(it.diagnosis)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-caption font-semibold text-text-secondary">{it.type}</div>
                <div className="text-tiny font-medium text-text-tertiary">{time(it.at)}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ===== RIGHT SIDE ===== */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {/* Hero row */}
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-[22px] font-medium text-text-tertiary">{greeting()},</div>
            <div className="text-[34px] font-extrabold leading-none tracking-tight text-text">{d.greeting.firstName}</div>
          </div>
          <div className="flex items-center gap-5">
            <Kpi label="Pending requisitions" value={d.kpis.pendingRequisitions} />
            <Divider />
            <Kpi label="Awaiting processing" value={d.kpis.awaitingProcessing} />
            <Divider />
            <Kpi label="Avg TAT" value={<>{d.kpis.avgTat} <span className="text-small font-semibold text-text-tertiary">days</span></>} />
            <div className="ml-1 flex items-center gap-2">
              <button onClick={() => router.push('/analytics')} aria-label="Analytics" className="grid h-11 w-11 place-items-center rounded-full border border-card bg-surface text-text-secondary hover:text-text"><BarChart3 size={18} /></button>
              <button onClick={() => router.push('/records')} aria-label="Open records" className="grid h-11 w-11 place-items-center rounded-full bg-text text-white hover:bg-text/90"><ArrowUpRight size={18} /></button>
            </div>
          </div>
        </div>

        {/* Alert cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {/* Requires attention (~50%) */}
          <div className="relative col-span-1 overflow-hidden rounded-card bg-[#eef3ff] p-5 md:col-span-2">
            <span className="absolute inset-y-4 left-0 w-1 rounded-pill bg-primary" />
            <div className="pl-3">
              <div className="text-caption font-bold uppercase tracking-wide text-primary">Requires attention</div>
              {d.alerts.attention ? (
                <>
                  <div className="mt-2 text-[16px] font-bold leading-snug text-text">{d.alerts.attention.text}</div>
                  <div className="mt-1 text-small font-semibold text-text-secondary">{d.alerts.attention.patient} · {d.alerts.attention.formType} · {d.alerts.attention.labNumber ?? ''}</div>
                  <div className="mt-4 flex items-center justify-between">
                    {d.alerts.attention.assignees?.length
                      ? <AvatarStack avatars={d.alerts.attention.assignees.map((a: any) => ({ name: a.name }))} size={30} max={4} />
                      : <span className="text-caption font-medium text-text-tertiary">Unassigned</span>}
                    <button onClick={() => router.push('/records')} aria-label="Open case" className="grid h-10 w-10 place-items-center rounded-full bg-text text-white hover:bg-text/90"><ArrowUpRight size={18} /></button>
                  </div>
                </>
              ) : <div className="mt-2 text-small font-medium text-text-secondary">Nothing needs attention right now.</div>}
            </div>
          </div>

          {/* Lab notifications (~25%) */}
          <AlertStat tint="#eef3ff" label="Lab notifications" value={d.alerts.notifications} labelColor="text-primary" onClick={() => router.push('/notifications')} />

          {/* Authorized today (~25%) — green */}
          <AlertStat tint="#edfaf4" label="Authorized today" value={d.alerts.authorizedToday} labelColor="text-success" onClick={() => router.push('/authorizer')} />
        </div>

        {/* Records table */}
        <div className="flex flex-col rounded-card border border-card bg-gradient-to-b from-white to-[#f5f7fd] shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
            <h2 className="text-[20px] font-extrabold tracking-tight text-text">Today&apos;s records · {d.records.length}</h2>
            <div className="flex items-center gap-2">
              <div className="flex h-10 items-center gap-2 rounded-pill border border-card bg-surface px-3 text-text-tertiary">
                <Search size={16} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records" className="w-40 border-none bg-transparent text-small text-text outline-none placeholder:text-text-tertiary" />
              </div>
              <button aria-label="Filter" className="grid h-10 w-10 place-items-center rounded-full border border-card bg-surface text-text-secondary hover:text-text"><SlidersHorizontal size={16} /></button>
              <button onClick={() => setDrawerOpen(true)} className="flex h-10 items-center gap-1.5 rounded-pill bg-primary px-4 text-small font-bold text-white hover:bg-primary-hover"><Plus size={16} /> Add</button>
            </div>
          </div>
          <div className="px-3 pb-3 pt-2">
            <Table rowKey="id" columns={columns} dataSource={rows} pagination={false} size="middle"
              onRow={(r: any) => ({ onClick: () => r.patientId && router.push(`/patients/${r.patientId}`), style: { cursor: 'pointer' } })}
              locale={{ emptyText: 'No records today yet.' }} />
          </div>
        </div>
      </div>

      <PatientFormDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); refetch(); }} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-right">
      <div className="text-caption font-semibold text-text-tertiary">{label}</div>
      <div className="text-[26px] font-extrabold leading-tight tracking-tight text-text">{value}</div>
    </div>
  );
}
function Divider() { return <span className="h-9 w-px bg-border" />; }

function AlertStat({ tint, label, value, labelColor, onClick }: { tint: string; label: string; value: number; labelColor: string; onClick?: () => void }) {
  return (
    <div className="col-span-1 flex flex-col justify-between rounded-card p-5" style={{ background: tint }}>
      <div className="flex items-start justify-between">
        <div className={`text-caption font-bold uppercase tracking-wide ${labelColor}`}>{label}</div>
        <button onClick={onClick} aria-label={label} className="grid h-9 w-9 place-items-center rounded-full bg-white/70 text-text-secondary hover:text-text"><ArrowUpRight size={16} /></button>
      </div>
      <div className="mt-6 text-[40px] font-extrabold leading-none tracking-tight text-text">{value}</div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 xl:flex-row">
      <div className="h-[620px] w-full rounded-card border border-card bg-surface p-5 shadow-card xl:w-[340px]"><Skeleton active paragraph={{ rows: 10 }} /></div>
      <div className="flex flex-1 flex-col gap-6">
        <div className="h-20 rounded-card" />
        <div className="grid grid-cols-4 gap-6">
          <div className="col-span-2 h-40 rounded-card bg-[#eef3ff]" /><div className="h-40 rounded-card bg-[#eef3ff]" /><div className="h-40 rounded-card bg-[#edfaf4]" />
        </div>
        <div className="rounded-card border border-card bg-surface p-6 shadow-card"><Skeleton active paragraph={{ rows: 8 }} /></div>
      </div>
    </div>
  );
}
