/**
 * The product's single acknowledgement channel.
 *
 * Before this there were two: antd `message.*` (186 calls, 42 files) and a per-page
 * hand-rolled `toast` (105 calls) with five different dismiss timers
 * (2500 / 3000 / 3200 / 3500 / 4000ms). Users saw two visual languages for the same event.
 *
 * Experience Principle §8: acknowledge every action, once, from one system, on one timer.
 *
 * This module is deliberately framework-agnostic at the call site: it holds a reference
 * to antd's `message` API, installed once from the provider tree (antd's `message` must
 * come from `App.useApp()` to inherit theme + context; the static import does not).
 */
import type { MessageInstance } from 'antd/es/message/interface';

/** One timer for every acknowledgement in the product. */
export const NOTIFY_DURATION_S = 3;

let instance: MessageInstance | null = null;

/** Called once, from the provider tree. */
export function setNotifier(api: MessageInstance) {
  instance = api;
}

function emit(kind: 'success' | 'error' | 'info' | 'loading', content: string, key?: string) {
  if (!instance) {
    // Never throw from a feedback path. A missing notifier must not break the action.
    if (kind === 'error') console.error('[notify]', content);
    return;
  }
  instance.open({ type: kind, content, key, duration: kind === 'loading' ? 0 : NOTIFY_DURATION_S });
}

export const notify = {
  success: (content: string, key?: string) => emit('success', content, key),
  error: (content: string, key?: string) => emit('error', content, key),
  info: (content: string, key?: string) => emit('info', content, key),
  /** Persistent until `notify.success/error` is called with the same key. */
  loading: (content: string, key: string) => emit('loading', content, key),
};

/**
 * Turns an unknown thrown value into something a human can act on.
 * Never surfaces a stack trace or an axios object.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { data?: { message?: unknown } }; message?: unknown };
    const server = anyE.response?.data?.message;
    if (typeof server === 'string' && server.trim()) return server;
    if (Array.isArray(server) && typeof server[0] === 'string') return server[0];
    if (typeof anyE.message === 'string' && anyE.message && !anyE.message.startsWith('Request failed')) {
      return anyE.message;
    }
  }
  return fallback;
}
