'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { connectSocket, disconnectSocket } from '@/lib/realtime';
import { useAuth } from '@/lib/auth';

const RealtimeContext = createContext<{ connected: boolean }>({ connected: false });
export const useRealtimeStatus = () => useContext(RealtimeContext);

/**
 * Owns the single app socket. Connects only for authenticated users and, on each
 * pushed event, invalidates the relevant react-query keys so the dashboard KPIs,
 * specimen queue, notifications bell and workforce roster refetch automatically —
 * no page refresh, no per-page wiring.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthed) return;
    const socket = connectSocket();

    const invalidate = (keys: QueryKey[]) => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    const invalidateWhere = (needles: string[]) =>
      qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === 'string' && needles.some((n) => k.includes(n));
        },
      });

    // Dashboard home (specimen queue + effectiveness) and patients overview (KPIs).
    const onDashboard = () => invalidate([['dashboard-home'], ['patients-overview']]);
    // Notifications bell badge + lists.
    const onNotification = () => invalidate([['notifications-unread'], ['notifications'], ['wf-notifications-page']]);
    // Workforce roster / attendance views.
    const onAttendance = () => invalidateWhere(['workforce', 'attendance', 'roster', 'wf-']);
    // Superuser support desk.
    const onTicket = () => invalidateWhere(['support', 'ticket']);
    // Company branding (logo/name/tagline) → app shell + settings pane refetch.
    const onBranding = () => invalidate([['lab-branding'], ['lab-profile']]);

    const bindings: [string, () => void][] = [
      ['specimen:new', onDashboard],
      ['specimen:updated', onDashboard],
      ['dashboard:refresh', onDashboard],
      ['result:authorized', onDashboard],
      ['result:updated', onDashboard],
      ['escalation:new', onDashboard],
      ['notification:new', onNotification],
      ['attendance:clockin', onAttendance],
      ['attendance:clockout', onAttendance],
      ['attendance:update', onAttendance],
      ['ticket:new', onTicket],
      ['lab:branding-updated', onBranding],
    ];

    const onConnect = () => { setConnected(true); console.debug('[Realtime] connected'); };
    const onDisconnect = () => { setConnected(false); console.debug('[Realtime] disconnected'); };
    const onError = (err: Error) => console.warn('[Realtime] connect_error:', err.message);
    const onAny = (event: string, payload: unknown) => console.debug('[Realtime] event:', event, payload);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    socket.onAny(onAny);
    bindings.forEach(([event, fn]) => socket.on(event, fn));

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
      socket.offAny(onAny);
      bindings.forEach(([event, fn]) => socket.off(event, fn));
      disconnectSocket();
      setConnected(false);
    };
  }, [isAuthed, qc]);

  return <RealtimeContext.Provider value={{ connected }}>{children}</RealtimeContext.Provider>;
}
