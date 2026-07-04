'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronRight, Clock, FlaskConical, MessageSquarePlus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import {
  CrStatusBadge, fmtDate, fmtDateTime, greeting, isAuthorized, specLabel, SpecimenIcon, StatusBadge,
} from '@/lib/portal-ui';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white';

export default function PortalDashboard() {
  const router = useRouter();
  const { data: me } = useQuery({ queryKey: ['portal-me'], queryFn: () => portalApi.get('/portal/auth/me').then((r) => r.data) });
  const { data: recData } = useQuery({ queryKey: ['portal-records', 'dash'], queryFn: () => portalApi.get('/portal/records', { params: { pageSize: 200 } }).then((r) => r.data) });
  const { data: crData } = useQuery({ queryKey: ['portal-change-requests', 'dash'], queryFn: () => portalApi.get('/portal/change-requests', { params: { pageSize: 3 } }).then((r) => r.data) });

  const records: any[] = recData?.data ?? [];
  const total = recData?.total ?? records.length;
  const authorized = records.filter((r) => isAuthorized(r.status)).length;
  const pending = records.filter((r) => !isAuthorized(r.status)).length;
  const recent = records.slice(0, 5);
  const messages: any[] = crData?.data ?? [];

  const kpis = [
    { icon: FlaskConical, label: 'Total Records', value: total, hue: '#4F46E5' },
    { icon: CheckCircle2, label: 'Authorized', value: authorized, hue: '#16A34A' },
    { icon: Clock, label: 'Pending', value: pending, hue: '#0EA5E9' },
  ];

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">{greeting()}{me?.firstName ? `, ${me.firstName}` : ''}</h1>
        <p className="mt-1 text-[14px] text-[#64748B]">Here are your latest lab results.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className={`${CARD} flex items-center gap-3 p-5`}>
            <span style={{ background: `${k.hue}1A`, color: k.hue }} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"><k.icon size={20} /></span>
            <div>
              <div className="text-[26px] font-bold leading-none text-[#0F172A]">{k.value}</div>
              <div className="mt-1 text-[13px] font-medium text-[#64748B]">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent records */}
      <div className={CARD}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[17px] font-bold text-[#0F172A]">Recent Records</h2>
          <Link href="/portal/records" className="text-[13px] font-semibold text-[#4F46E5] hover:underline">View all →</Link>
        </div>
        <div className="border-t border-[#F8FAFC]">
          {recent.length === 0 && <div className="px-5 py-10 text-center text-[13px] text-[#94A3B8]">No records yet.</div>}
          {recent.map((r) => (
            <button key={r.id} onClick={() => router.push(`/portal/records/${r.id}`)}
              className="flex w-full items-center gap-4 border-b border-[#F8FAFC] px-5 py-4 text-left transition-colors last:border-0 hover:bg-[#FAFBFD]">
              <SpecimenIcon type={r.specimens?.[0]?.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-[#0F172A]">{r.labNumber ?? r.identifier}</span>
                  {r.specimens?.[0]?.type && <span className="rounded-md bg-surface-container px-2 py-0.5 font-label-sm text-label-sm text-secondary">{specLabel(r.specimens[0].type)}</span>}
                </div>
                <div className="mt-0.5 text-[13px] text-[#64748B]">{r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'}</div>
                <div className="text-[12px] text-[#94A3B8]">{fmtDate(r.dateStatus ?? r.createdAt)}</div>
              </div>
              <StatusBadge status={r.status} />
              <ChevronRight size={18} className="shrink-0 text-[#CBD5E1]" />
            </button>
          ))}
        </div>
        <Link href="/portal/records" className="block border-t border-[#F8FAFC] px-5 py-3.5 text-center text-[13px] font-semibold text-[#4F46E5] hover:underline">View all records →</Link>
      </div>

      {/* Messages preview */}
      <div className={CARD}>
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[17px] font-bold text-[#0F172A]">Recent Messages</h2>
          <Link href="/portal/messages" className="text-[13px] font-semibold text-[#4F46E5] hover:underline">View all →</Link>
        </div>
        <div className="border-t border-[#F8FAFC]">
          {messages.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-[#94A3B8]">No messages yet.</div>
          ) : (
            messages.map((m) => (
              <Link key={m.id} href="/portal/messages" className="flex items-center gap-3 border-b border-[#F8FAFC] px-5 py-3.5 transition-colors last:border-0 hover:bg-[#FAFBFD]">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-[#0F172A]">{m.subject}</div>
                  <div className="truncate text-[12px] text-[#94A3B8]">{m.messages?.[m.messages.length - 1]?.body ?? 'No messages'} · {fmtDateTime(m.updatedAt)}</div>
                </div>
                <CrStatusBadge status={m.status} />
              </Link>
            ))
          )}
        </div>
        <div className="border-t border-[#F8FAFC] px-5 py-3.5">
          <Link href="/portal/messages" className="inline-flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2.5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110">
            <MessageSquarePlus size={15} /> New Message
          </Link>
        </div>
      </div>
    </div>
  );
}
