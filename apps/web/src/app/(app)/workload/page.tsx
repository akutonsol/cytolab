'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardList, Clock, Users2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/feature-context';
import {
  PRIORITY_META, avatarColor, progressColor,
  type AssignmentHistoryRow, type QueueRecord, type TatPriority, type WorkloadUser,
} from '@/lib/workload';
import { EmptyState } from '@/components/ui';
import { notify } from '@/lib/notify';

function PriorityBadge({ p }: { p: TatPriority }) {
  const m = PRIORITY_META[p];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: m.bg, color: m.fg }}>
      {(p === 'Stat' || p === 'Urgent') && <AlertTriangle size={12} />}{m.label}
    </span>
  );
}

function ProgressBar({ value, target }: { value: number; target: number }) {
  const ratio = target > 0 ? value / target : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-[#475569]">{value}/{target}</span>
        <span className="font-semibold" style={{ color: progressColor(ratio) }}>{pct}%</span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
        <div className="h-full rounded-full transition-[background-color,border-color,color,box-shadow,transform,opacity]" style={{ width: `${pct}%`, background: progressColor(ratio) }} />
      </div>
    </div>
  );
}

function Avatar({ name, initials, size = 46 }: { name: string; initials: string; size?: number }) {
  const c = avatarColor(name);
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold" style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export default function WorkloadPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { claims, can } = useAuth();
  const { isEnabled } = useFeatures();
  const enabled = isEnabled('CASE_ASSIGNMENT');
  const canAssign = can('record:change');
  const isReviewer = claims?.isSuperRole || (claims?.permissions ?? []).includes('resultsheet:authorize');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUser, setBulkUser] = useState('');

  const { data: team = [] } = useQuery<WorkloadUser[]>({
    queryKey: ['workload-summary'], queryFn: () => api.get('/workload/summary').then((r) => r.data), enabled,
    refetchInterval: 60_000,
  });
  const { data: unassigned = [] } = useQuery<QueueRecord[]>({
    queryKey: ['workload-unassigned'], queryFn: () => api.get('/workload/unassigned').then((r) => r.data), enabled,
    refetchInterval: 60_000,
  });
  const { data: myQueue = [] } = useQuery<QueueRecord[]>({
    queryKey: ['my-queue'], queryFn: () => api.get('/records/my-queue').then((r) => r.data), enabled: enabled && !!isReviewer,
    refetchInterval: 60_000,
  });
  const { data: history = [] } = useQuery<AssignmentHistoryRow[]>({
    queryKey: ['workload-history'], queryFn: () => api.get('/workload/history').then((r) => r.data), enabled,
  });

  const invalidate = () => {
    ['workload-summary', 'workload-unassigned', 'my-queue', 'workload-history', 'records-all'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const assign = useMutation({
    mutationFn: ({ recordId, userId }: { recordId: string; userId: string }) => api.patch(`/records/${recordId}/assign`, { assignedToId: userId }),
    onSuccess: () => { notify.success('Case assigned'); invalidate(); },
    onError: () => notify.error('Assignment failed'),
  });
  const bulkAssign = useMutation({
    mutationFn: ({ recordIds, userId }: { recordIds: string[]; userId: string }) => api.patch('/records/bulk-assign', { recordIds, assignedToId: userId }),
    onSuccess: (r: any) => { notify.success(`${r.data.assigned} cases assigned`); setSelected(new Set()); setBulkUser(''); invalidate(); },
    onError: () => notify.error('Bulk assignment failed'),
  });

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const options = useMemo(() => team.map((t) => ({ id: t.userId, name: t.userName })), [team]);

  if (!enabled) {
    return (
      <div className="min-h-full pt-4" style={{ background: '#F8FAFC' }}>
        <EmptyState className="mt-16"
              icon={<Users2 size={28} />}
              title={<>Feature not enabled</>}
              description={<>Case Assignment & Workload is disabled for this lab.</>}
            />
      </div>
    );
  }

  return (
    <div className="min-h-full pb-10 pt-4" style={{ background: '#F8FAFC' }}>
      <div className="mb-6">
        <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#0F172A]">Workload &amp; Case Assignment</h1>
        <p className="mt-1.5 text-[16px] text-[#6B7280]">Assign cases to pathologists and balance workload against daily targets.</p>
      </div>

      {/* Team overview */}
      <div className="mb-7">
        <div className="mb-4 text-[14px] font-bold uppercase tracking-wide text-[#475569]">Team Overview</div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {team.length === 0 && <div className="rounded-2xl border border-[#EEF2F7] bg-white p-6 text-[15px] text-[#475569]">No pathologists found.</div>}
          {team.map((u) => (
            <div key={u.userId} className="rounded-2xl border border-[#EEF2F7] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
              <div className="flex items-center gap-3.5">
                <Avatar name={u.userName} initials={u.avatarInitials} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[17px] font-bold text-[#0F172A]">{u.userName}</div>
                  <div className="text-[13px] text-[#475569]">{u.role}</div>
                </div>
                <div className="text-right">
                  <div className="text-[28px] font-bold leading-none text-[#0F172A]">{u.assignedTotal}</div>
                  <div className="text-[12px] text-[#475569]">open cases</div>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                <div><div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Daily</div><ProgressBar value={u.authorizedToday} target={u.dailyTarget} /></div>
                <div><div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#475569]">Weekly</div><ProgressBar value={u.authorizedThisWeek} target={u.weeklyTarget} /></div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                {u.tatBreachCount > 0
                  ? <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-bold" style={{ background: '#FEE2E2', color: '#B91C1C' }}><AlertTriangle size={13} /> {u.tatBreachCount} TAT breach{u.tatBreachCount === 1 ? '' : 'es'}</span>
                  : <span className="text-[13px] text-[#475569]">No breaches</span>}
                <button onClick={() => router.push(`/authorizer?assignee=${u.userId}`)} className="rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#4F46E5]">View Queue</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle: unassigned + my queue */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        {/* Unassigned */}
        <div className="rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF2F7] p-5">
            <div className="text-[17px] font-bold text-[#0F172A]">Unassigned Cases ({unassigned.length})</div>
            {canAssign && selected.size > 0 && (
              <div className="flex items-center gap-2">
                <select value={bulkUser} onChange={(e) => setBulkUser(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-2.5 text-[14px] outline-none focus:border-[#4F46E5]">
                  <option value="">Assign {selected.size} to…</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button disabled={!bulkUser} onClick={() => bulkAssign.mutate({ recordIds: Array.from(selected), userId: bulkUser })}
                  className="rounded-lg bg-[#4F46E5] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-40">Bulk Assign</button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-[12px] uppercase tracking-wide text-[#475569]">
                  {canAssign && <th className="px-4 py-3" />}
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Lab#</th>
                  <th className="px-4 py-3 font-semibold">Patient</th>
                  <th className="px-4 py-3 font-semibold">Specimen</th>
                  <th className="px-4 py-3 font-semibold">Elapsed</th>
                  {canAssign && <th className="px-4 py-3 font-semibold">Assign To</th>}
                </tr>
              </thead>
              <tbody>
                {unassigned.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-[15px] text-[#475569]">No unassigned cases 🎉</td></tr>
                ) : unassigned.map((r) => (
                  <tr key={r.id} className="border-b border-[#F1F5F9]">
                    {canAssign && <td className="px-4 py-3.5"><input type="checkbox" className="h-4 w-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} style={{ accentColor: '#4F46E5' }} /></td>}
                    <td className="px-4 py-3.5"><PriorityBadge p={r.tatPriority} /></td>
                    <td className="px-4 py-3.5 font-semibold text-[#0F172A]">{r.labNumber ?? r.identifier}</td>
                    <td className="px-4 py-3.5 text-[#334155]">{r.patientName}</td>
                    <td className="px-4 py-3.5 text-[#475569]">{r.specimenType ?? '—'}</td>
                    <td className="px-4 py-3.5 text-[#475569]">{r.hoursElapsed}h</td>
                    {canAssign && (
                      <td className="px-4 py-3.5">
                        <select defaultValue="" onChange={(e) => e.target.value && assign.mutate({ recordId: r.id, userId: e.target.value })}
                          className="h-9 rounded-lg border border-[#E2E8F0] px-2.5 text-[14px] outline-none focus:border-[#4F46E5]">
                          <option value="">Assign…</option>
                          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* My queue */}
        {isReviewer && (
          <div className="rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="border-b border-[#EEF2F7] p-5 text-[17px] font-bold text-[#0F172A]">My Queue ({myQueue.length})</div>
            <div className="flex flex-col">
              {myQueue.length === 0 ? (
                <div className="px-4 py-12 text-center text-[15px] text-[#475569]">No cases assigned to you</div>
              ) : myQueue.map((r) => (
                <div key={r.id} className="flex items-center gap-3 border-b border-[#F1F5F9] px-5 py-4">
                  <PriorityBadge p={r.tatPriority} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-[#0F172A]">{r.labNumber ?? r.identifier} · {r.patientName}</div>
                    <div className="text-[13px] text-[#475569]">{r.specimenType ?? '—'} · {r.hoursElapsed}h elapsed</div>
                  </div>
                  <button onClick={() => router.push(`/records/${r.id}`)} className="rounded-lg bg-[#EEF2FF] px-4 py-2 text-[13px] font-semibold text-[#4F46E5]">Open</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assignment history */}
      <div className="mt-6 rounded-2xl border border-[#EEF2F7] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="border-b border-[#EEF2F7] p-5 text-[17px] font-bold text-[#0F172A]">Assignment History</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[12px] uppercase tracking-wide text-[#475569]">
                <th className="px-4 py-3 font-semibold">Record</th>
                <th className="px-4 py-3 font-semibold">Patient</th>
                <th className="px-4 py-3 font-semibold">Assigned To</th>
                <th className="px-4 py-3 font-semibold">Assigned By</th>
                <th className="px-4 py-3 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-[15px] text-[#475569]">No assignments yet.</td></tr>
              ) : history.map((h) => (
                <tr key={`${h.recordId}-${h.assignedAt}`} className="border-b border-[#F1F5F9]">
                  <td className="px-4 py-3.5 font-semibold text-[#0F172A]">{h.labNumber}</td>
                  <td className="px-4 py-3.5 text-[#334155]">{h.patientName}</td>
                  <td className="px-4 py-3.5 text-[#334155]">{h.assignedTo}</td>
                  <td className="px-4 py-3.5 text-[#475569]">{h.assignedBy}</td>
                  <td className="px-4 py-3.5 text-[#475569]">{new Date(h.assignedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
