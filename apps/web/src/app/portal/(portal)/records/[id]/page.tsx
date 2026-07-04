'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, Download, ExternalLink, Loader2, MessageSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { portalApi } from '@/lib/portal-api';
import { fmtDate, isAuthorized, recordStep, specLabel, StatusBadge, STEPS } from '@/lib/portal-ui';

const CARD = 'rounded-2xl border border-[#EEF2F7] bg-white';

export default function PortalRecordDetail() {
  const id = String(useParams().id);
  const [busy, setBusy] = useState<'download' | 'view' | null>(null);

  const { data: me } = useQuery({ queryKey: ['portal-me'], queryFn: () => portalApi.get('/portal/auth/me').then((r) => r.data) });
  const { data: r, isLoading, isError } = useQuery({
    queryKey: ['portal-record', id],
    queryFn: () => portalApi.get(`/portal/records/${id}`).then((res) => res.data),
    enabled: !!id,
  });

  const getReport = async (mode: 'download' | 'view') => {
    if (!r) return;
    setBusy(mode);
    try {
      const res = await portalApi.get(`/portal/records/${r.id}/report.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      if (mode === 'view') {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = `report-${r.labNumber ?? r.identifier}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { /* not available */ } finally { setBusy(null); }
  };

  if (isError) return <div className="text-[14px] text-[#64748B]">This record could not be found.</div>;
  if (isLoading || !r) return <div className="h-40 animate-pulse rounded-2xl bg-surface-container" />;

  const authorized = isAuthorized(r.status);
  const step = recordStep(r.status);
  const clientName = me?.client?.officeName || (me?.client ? `${me.client.firstName} ${me.client.lastName}` : '—');
  const authEvent = (r.statusHistory ?? []).filter((e: any) => isAuthorized(e.status)).slice(-1)[0];

  const Info = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-[14px] font-medium text-[#0F172A]">{value}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/portal/records" className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#4F46E5] hover:underline"><ArrowLeft size={15} /> Back to records</Link>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* LEFT */}
        <div className="flex min-w-0 flex-[3] flex-col gap-6">
          <div className={`${CARD} p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-[24px] font-bold tracking-tight text-[#0F172A]">{r.labNumber ?? r.identifier}</span>
              <StatusBadge status={r.status} />
              {r.specimens?.[0]?.type && <span className="rounded-md bg-surface-container px-2.5 py-1 font-label-sm text-label-sm text-secondary">{specLabel(r.specimens[0].type)}</span>}
              {r.urgent && <span className="rounded-full bg-error-container px-3 py-1 font-label-sm text-label-sm text-error">Urgent</span>}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
              <Info label="Patient" value={r.patient ? `${r.patient.firstName} ${r.patient.lastName}` : '—'} />
              <Info label="Specimen" value={specLabel(r.specimens?.[0]?.type)} />
              <Info label="Received" value={fmtDate(r.specimens?.[0]?.dateReceived ?? r.createdAt)} />
              <Info label="Client" value={clientName} />
            </div>
          </div>

          {/* Timeline */}
          <div className={`${CARD} p-6`}>
            <h2 className="text-[15px] font-bold text-[#0F172A]">Progress</h2>
            <div className="mt-5 flex flex-col gap-0">
              {STEPS.map((label, i) => {
                const done = i < step;
                const current = i === step;
                const active = done || current;
                return (
                  <div key={label} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <span className="grid h-8 w-8 place-items-center rounded-full text-white"
                        style={{ background: active ? '#4F46E5' : '#E5E7EB', color: active ? '#fff' : '#9CA3AF' }}>
                        {done ? <CheckCircle2 size={16} /> : <span className="text-[13px] font-bold">{i + 1}</span>}
                      </span>
                      {i < STEPS.length - 1 && <span className="my-1 w-0.5 flex-1" style={{ minHeight: 22, background: done ? '#4F46E5' : '#E5E7EB' }} />}
                    </div>
                    <div className="pb-4">
                      <div className="text-[14px] font-semibold" style={{ color: active ? '#0F172A' : '#9CA3AF' }}>{label}</div>
                      {current && <div className="text-[12px] font-medium text-[#4F46E5]">Current stage</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity (read-only) */}
          {(r.statusHistory ?? []).length > 0 && (
            <div className={`${CARD} p-6`}>
              <h2 className="text-[15px] font-bold text-[#0F172A]">Activity</h2>
              <div className="mt-4 flex flex-col gap-3">
                {[...r.statusHistory].reverse().map((e: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#4F46E5]" />
                    <span className="text-[13px] font-semibold text-[#0F172A]">{e.status}</span>
                    {e.notes && <span className="truncate text-[13px] text-[#64748B]">· {e.notes}</span>}
                    <span className="ml-auto shrink-0 text-[12px] text-[#94A3B8]">{fmtDate(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="flex flex-[2] flex-col gap-6">
          {authorized ? (
            <div className={`${CARD} p-6 text-center`}>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#F0FDF4] text-[#16A34A]"><CheckCircle2 size={28} /></span>
              <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Your report is ready</div>
              <div className="mt-1 text-[13px] text-[#94A3B8]">Authorized on {fmtDate(authEvent?.createdAt ?? r.dateStatus)}</div>
              <button onClick={() => getReport('download')} disabled={busy !== null}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#4F46E5] text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-60">
                {busy === 'download' ? <><Loader2 size={16} className="animate-spin" /> Preparing…</> : <><Download size={16} /> Download Report</>}
              </button>
              <button onClick={() => getReport('view')} disabled={busy !== null}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] text-[14px] font-semibold text-[#374151] transition-colors hover:bg-[#F9FAFB] disabled:opacity-60">
                {busy === 'view' ? <><Loader2 size={16} className="animate-spin" /> Opening…</> : <><ExternalLink size={16} /> View in browser</>}
              </button>
            </div>
          ) : (
            <div className={`${CARD} p-6 text-center`}>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#EEF3FF] text-[#4F46E5]"><Clock size={28} /></span>
              <div className="mt-3 text-[18px] font-bold text-[#0F172A]">Report pending</div>
              <div className="mt-1 text-[13px] text-[#64748B]">Your report is being processed. Current status: <span className="font-semibold text-[#0F172A]">{r.status}</span>.</div>
            </div>
          )}

          <div className={`${CARD} p-6`}>
            <div className="text-[15px] font-bold text-[#0F172A]">Have a question?</div>
            <div className="mt-1 text-[13px] text-[#64748B]">Message the lab about this record.</div>
            <Link href={`/portal/messages?recordId=${r.id}`}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#4F46E5] text-[14px] font-semibold text-[#4F46E5] transition-colors hover:bg-[#EEF3FF]">
              <MessageSquare size={16} /> Send Message
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
