/**
 * The product's single acknowledgement channel.
 *
 * Before Sprint 10 there were two renderers: antd `message.*` (192 calls) and a
 * hand-rolled per-page toast (27 files, each with its own `useState`, its own JSX node
 * and its own `setTimeout` — 2500 / 3000 / 3200 / 3500ms). The same event looked
 * different depending on which screen you were standing on.
 *
 * Experience Principle §8: acknowledge every action, once, from one system, on one timer.
 *
 * ── Dismiss timing is a property of MEANING, not of the page ──────────────────────────
 * A success is a receipt; you already know what you did. An error is information you have
 * not read yet, and it may be the only place the server's reason appears. Progress has no
 * duration at all: it ends when the work does.
 *
 * These are read-durations, not animations. `prefers-reduced-motion` shortens the
 * entrance, never the time text stays on screen.
 */
import type { MessageInstance } from 'antd/es/message/interface';

export const NOTIFY_DURATION_S = {
  success: 3,
  info: 3,
  /** Long enough to read a sentence you did not expect. */
  warning: 5,
  /** Errors often carry the server's only explanation. Give them room. */
  error: 6,
  /** Persists until resolved by `notify.success/error` with the same key. */
  progress: 0,
} as const;

export type NotifyKind = keyof typeof NOTIFY_DURATION_S;

let instance: MessageInstance | null = null;

/** Called once, from the provider tree. */
export function setNotifier(api: MessageInstance) {
  instance = api;
}

/**
 * A message with a `key` replaces the one already on screen instead of stacking a second
 * copy — which is also what keeps screen readers from announcing the same thing twice.
 * Without a key we derive one from the text, so a double-click cannot produce two
 * identical toasts.
 */
const keyFor = (kind: NotifyKind, content: string, key?: string) => key ?? `${kind}:${content}`;

function emit(kind: NotifyKind, content: string, key?: string) {
  if (!instance) {
    // Never throw from a feedback path: a missing notifier must not break the action.
    if (kind === 'error') console.error('[notify]', content);
    return;
  }
  instance.open({
    // antd has no `progress` type; a persistent spinner is its `loading`.
    type: kind === 'progress' ? 'loading' : kind,
    content,
    key: keyFor(kind, content, key),
    duration: NOTIFY_DURATION_S[kind],
  });
}

export const notify = {
  success: (content: string, key?: string) => emit('success', content, key),
  error: (content: string, key?: string) => emit('error', content, key),
  info: (content: string, key?: string) => emit('info', content, key),
  warning: (content: string, key?: string) => emit('warning', content, key),
  /**
   * A persistent "working…" notice. Resolve it by calling `notify.success(msg, key)` or
   * `notify.error(msg, key)` with the SAME key — never leave one on screen.
   */
  progress: (content: string, key: string) => emit('progress', content, key),
  /** Back-compat alias for `progress`. */
  loading: (content: string, key: string) => emit('progress', content, key),
  /** Dismiss a keyed notice without replacing it (e.g. the work was cancelled). */
  dismiss: (key: string) => instance?.destroy(key),
  /** Dismiss everything. Bound to Escape by `NotifierBridge`. */
  dismissAll: () => instance?.destroy(),
};

/**
 * Turns an unknown thrown value into something a human can act on.
 * Never surfaces a stack trace or an axios object. Server-provided messages win.
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
