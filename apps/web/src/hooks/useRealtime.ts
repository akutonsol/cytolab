'use client';
import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket } from '@/lib/realtime';

export type RealtimeEvent =
  | 'specimen:new'
  | 'specimen:updated'
  | 'result:authorized'
  | 'result:updated'
  | 'attendance:clockin'
  | 'attendance:clockout'
  | 'attendance:update'
  | 'notification:new'
  | 'ticket:new'
  | 'escalation:new'
  | 'dashboard:refresh';

type Handlers = Partial<Record<RealtimeEvent, (data: unknown) => void>>;

/**
 * Subscribe to realtime events for the lifetime of the calling component.
 * The socket connection itself is owned by RealtimeProvider; this only attaches
 * handlers. Handlers are kept in a ref so re-renders don't re-subscribe.
 */
export function useRealtime(events: Handlers) {
  const ref = useRef<Handlers>(events);
  ref.current = events;

  useEffect(() => {
    const socket = connectSocket();
    const keys = Object.keys(ref.current) as RealtimeEvent[];
    const listeners = keys.map((event) => {
      const fn = (data: unknown) => ref.current[event]?.(data);
      socket.on(event, fn);
      return [event, fn] as const;
    });
    return () => {
      listeners.forEach(([event, fn]) => socket.off(event, fn));
    };
    // Subscribe once per mount; handler bodies read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useDisconnectOnUnmount() {
  useEffect(() => () => disconnectSocket(), []);
}
