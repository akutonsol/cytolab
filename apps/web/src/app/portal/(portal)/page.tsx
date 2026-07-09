'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronRight, Clock, ClipboardList, Download, FileText, FlaskConical, MessageSquare, MessageSquarePlus, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import {
  CrStatusBadge, fmtDate, fmtDateTime, greeting, isAuthorized, specLabel, SpecimenIcon, StatusBadge,
} from '@/lib/portal-ui';
import { Card, cardClass, cn } from '@/components/ui';


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

  const authRate = total ? Math.round((authorized / total) * 100) : 0;

  // Zero-orange: pending uses the portal's safe amber (#FEF3C7/#92400E), not #f59e0b.
  const stats = [
    { Icon: FlaskConical, iconBg: '#EEF2FF', iconColor: '#4F46E5', value: total, label: 'Total Records', sub: '+3 this week', subColor: '#16A34A' },
    { Icon: CheckCircle2, iconBg: '#F0FDF4', iconColor: '#16A34A', value: authorized, label: 'Authorized', sub: `${authRate}% of total`, subColor: '#64748B' },
    { Icon: Clock, iconBg: '#FEF3C7', iconColor: '#92400E', value: pending, label: 'Pending Review', sub: 'Avg 2.1 days', subColor: '#64748B' },
    { Icon: FileText, iconBg: '#FFF1F2', iconColor: '#E63946', value: authorized, label: 'Reports Ready', sub: 'Download now', subColor: '#4F46E5' },
  ];

  const actions = [
    { Icon: ClipboardList, label: 'New Requisition', sub: 'Submit specimens', href: '/portal/requisitions', color: '#4F46E5' },
    { Icon: Download, label: 'Download Reports', sub: `${authorized} ready`, href: '/portal/reports', color: '#16A34A' },
    { Icon: MessageSquare, label: 'Message Lab', sub: 'Ask a question', href: '/portal/messages', color: '#92400E' },
  ];

  const tatBars = [38, 42, 35, 48, 40, 52, 44, 36, 50, 46, 38, 44];

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-[#0F172A]">{greeting()}{me?.firstName ? `, ${me.firstName}` : ''}</h1>
        <p className="mt-1 text-[14px] text-[#64748B]">Here are your latest lab results.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((c) => (
          <Card radius="md" elevation="none" border="hairline" className="flex items-center gap-4 p-5" key={c.label}>
            <span style={{ background: c.iconBg, color: c.iconColor }} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"><c.Icon size={20} /></span>
            <div>
              <div className="text-[30px] font-extrabold leading-none text-[#0a0b1a]">{c.value}</div>
              <div className="mt-1 text-[13px] text-[#64748b]">{c.label}</div>
              <div className="mt-1 text-[12px] font-medium" style={{ color: c.subColor }}>{c.sub}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {actions.map((a) => (
          <Link key={a.label} href={a.href}
            className={cn(cardClass({ elevation: 'none' }), 'group flex items-center gap-3.5 p-5 transition-shadow duration-fast ease-standard hover:shadow-card-lift')}>
            <span style={{ background: `${a.color}18`, color: a.color }} className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]"><a.Icon size={18} /></span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[#0a0b1a]">{a.label}</div>
              <div className="text-[12px] text-[#64748b]">{a.sub}</div>
            </div>
            <ArrowRight size={16} className="ml-auto shrink-0 text-[#94a3b8] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>

      {/* Records + TAT */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.9fr_1fr]">
        {/* Recent records */}
        <Card radius="md" elevation="none" border="hairline">
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
        </Card>

        {/* Turnaround time */}
        <Card radius="md" elevation="none" border="hairline" className="p-6">
          <div className="text-[14px] font-semibold text-[#0a0b1a]">Turnaround Time</div>
          <div className="mt-0.5 text-[11px] text-[#64748b]">Last 30 days</div>
          <div className="mt-5 text-[40px] font-extrabold leading-none text-[#0a0b1a]">2.1</div>
          <div className="mt-1 text-[13px] text-[#64748b]">Avg days to result</div>
          <div className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[#16A34A]"><TrendingDown size={13} /> 0.3 days vs last month</div>

          <svg width="100%" height="60" viewBox="0 0 205 60" preserveAspectRatio="none" className="mt-5">
            {tatBars.map((h, i) => (
              <rect key={i} x={i * 17 + 1} y={60 - h * 0.9} width={13} height={h * 0.9} rx={3} fill={i === tatBars.length - 1 ? '#4F46E5' : '#EEF2FF'} />
            ))}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-[#94a3b8]"><span>Jun 1</span><span>Today</span></div>

          <div className="mt-5 flex flex-col gap-2.5">
            {[
              { label: 'Cytology', value: '1.8d', color: '#4F46E5' },
              { label: 'Histology', value: '2.4d', color: '#16A34A' },
              { label: 'Special Stain', value: '3.1d', color: '#92400E' },
            ].map((it) => (
              <div key={it.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ background: it.color }} className="h-2 w-2 rounded-full" />
                  <span className="text-[13px] text-[#374151]">{it.label}</span>
                </div>
                <span className="text-[13px] font-semibold text-[#0a0b1a]">{it.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Messages preview */}
      <Card radius="md" elevation="none" border="hairline">
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
      </Card>
    </div>
  );
}
