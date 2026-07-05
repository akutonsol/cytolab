'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Bell, CalendarOff, CheckCheck, FileClock, Timer, X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface WFNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  createdAt: string;
}

const timeAgo = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};

// icon + tint by notification type (zero-orange: rejects=red, approvals=green,
// everything else=indigo; no amber/orange).
function iconFor(type: string): { Icon: typeof Bell; bg: string; fg: string } {
  if (type.startsWith('LEAVE')) return { Icon: CalendarOff, bg: '#EEF2FF', fg: '#4F46E5' };
  if (type.startsWith('OVERTIME')) return { Icon: Timer, bg: '#EEF2FF', fg: '#4F46E5' };
  if (type.startsWith('TIMESHEET')) return { Icon: FileClock, bg: '#EEF2FF', fg: '#4F46E5' };
  if (type === 'MISSING_PUNCH_ALERT') return { Icon: AlertTriangle, bg: '#FEF9C3', fg: '#A16207' };
  return { Icon: Bell, bg: '#EEF2FF', fg: '#4F46E5' };
}

const routeFor = (n: WFNotification): string | null => {
  switch (n.relatedEntityType) {
    case 'LeaveRequest': return '/workforce/leave';
    case 'OvertimeRecord': return '/workforce/overtime';
    case 'Timesheet': return n.relatedEntityId ? `/workforce/timesheets/${n.relatedEntityId}` : '/workforce/timesheets';
    default: return null;
  }
};

export function WorkforceNotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();

  const { data: unread } = useQuery({
    queryKey: ['wf-notif-unread'],
    queryFn: () => api.get('/workforce/notifications/unread-count').then((r) => r.data as { count: number }),
    refetchInterval: 30_000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ['wf-notifications'],
    queryFn: () => api.get('/workforce/notifications').then((r) => r.data as WFNotification[]),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['wf-notifications'] });
    qc.invalidateQueries({ queryKey: ['wf-notif-unread'] });
  };
  const markAll = useMutation({ mutationFn: () => api.patch('/workforce/notifications/read-all'), onSuccess: invalidate });
  const markOne = useMutation({ mutationFn: (id: string) => api.patch(`/workforce/notifications/${id}/read`), onSuccess: invalidate });

  const count = unread?.count ?? 0;

  const onItemClick = (n: WFNotification) => {
    if (!n.isRead) markOne.mutate(n.id);
    const route = routeFor(n);
    if (route) { setOpen(false); router.push(route); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Workforce notifications"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-primary"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-[18px] text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-primary" />
                <span className="text-base font-bold text-charcoal-heading">Notifications</span>
                {count > 0 && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{count} new</span>}
              </div>
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>

            <div className="flex items-center justify-end border-b border-slate-100 px-5 py-2">
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending || count === 0}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline disabled:opacity-40"
              >
                <CheckCheck size={15} /> Mark all read
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="grid place-items-center px-6 py-16 text-center text-sm text-slate-400">
                  <Bell size={32} className="mb-3 text-slate-200" />
                  You&apos;re all caught up.
                </div>
              ) : (
                items.map((n) => {
                  const { Icon, bg, fg } = iconFor(n.type);
                  return (
                    <button
                      key={n.id}
                      onClick={() => onItemClick(n)}
                      className={`flex w-full items-start gap-3 border-b border-slate-100 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${n.isRead ? '' : 'border-l-[3px] border-l-primary bg-primary/[0.03]'}`}
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: bg, color: fg }}><Icon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm ${n.isRead ? 'font-medium text-slate-600' : 'font-bold text-charcoal-heading'}`}>{n.title}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{n.body}</span>
                      </span>
                      {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
