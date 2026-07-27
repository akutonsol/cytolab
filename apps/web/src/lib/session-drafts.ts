'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Session drafts + return-to
//
// When the session is about to idle-timeout, the SessionTimeoutProvider flushes
// every open form's in-progress values to localStorage (a "draft"). After the
// user signs back in and lands on the page they were on, the form detects its
// draft and offers to restore it — so nothing they were typing is lost. Drafts
// never hit the server; they're a purely client-side safety net.
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_NS = 'cytolab-draft:';
const RETURN_TO_KEY = 'cytolab-return-to';

export interface Draft<T = any> {
  data: T;
  savedAt: number; // epoch ms
  path?: string;
}

/** True when `data` holds at least one meaningful (non-empty) value. Empty forms
 *  are not worth persisting or offering to restore. */
export function draftHasContent(data: unknown): boolean {
  if (data == null) return false;
  if (typeof data === 'string') return data.trim().length > 0;
  if (typeof data === 'number') return !Number.isNaN(data);
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data.some(draftHasContent);
  if (typeof data === 'object') return Object.values(data as Record<string, unknown>).some(draftHasContent);
  return false;
}

export function saveDraft(key: string, data: unknown, path?: string): void {
  if (typeof window === 'undefined' || !draftHasContent(data)) return;
  try {
    const draft: Draft = { data, savedAt: Date.now(), path };
    localStorage.setItem(DRAFT_NS + key, JSON.stringify(draft));
  } catch {
    /* quota / serialization — best effort */
  }
}

export function loadDraft<T = any>(key: string): Draft<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DRAFT_NS + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft<T>;
    return draftHasContent(draft?.data) ? draft : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(DRAFT_NS + key); } catch { /* ignore */ }
}

// ── Registry of open forms ───────────────────────────────────────────────────
// Each mounted form registers a getter returning its current key + values. The
// SessionTimeoutProvider calls `flushAllDrafts()` right before logging the user
// out (and when the warning first appears) so every open form is snapshotted.

type DraftGetter = () => { key: string; data: unknown; path?: string } | null;
const getters = new Set<DraftGetter>();

export function registerDraftGetter(getter: DraftGetter): () => void {
  getters.add(getter);
  return () => { getters.delete(getter); };
}

export function flushAllDrafts(): void {
  for (const getter of Array.from(getters)) {
    try {
      const snap = getter();
      if (snap) saveDraft(snap.key, snap.data, snap.path);
    } catch {
      /* one bad form must not block the others */
    }
  }
}

/**
 * Register a form's live values for auto-draft. `getValues` is read only at flush
 * time, so it always sees the latest state without re-registering on every
 * keystroke. Pass `enabled: false` (e.g. drawer closed or edit-of-nothing) to opt
 * out.
 *
 * By default the draft is snapshotted only when the session is about to idle-time
 * out (the registry path). Pass `{ live: true }` to ALSO snapshot on an interval
 * and once more on close/unmount, so work is captured even when the user simply
 * closes the form or navigates away — no timeout required. `saveDraft` already
 * skips empty content, so an untouched form writes nothing.
 */
export function useAutosaveDraft(
  key: string,
  getValues: () => unknown,
  enabled = true,
  options?: { live?: boolean; intervalMs?: number },
): void {
  const getValuesRef = useRef(getValues);
  getValuesRef.current = getValues;
  const live = options?.live ?? false;
  const intervalMs = options?.intervalMs ?? 4000;

  useEffect(() => {
    if (!enabled || !key) return;
    const path = () =>
      typeof window !== 'undefined' ? window.location.pathname + window.location.search : undefined;
    const unregister = registerDraftGetter(() => ({ key, data: getValuesRef.current(), path: path() }));
    if (!live) return unregister;

    const snapshot = () => {
      try { saveDraft(key, getValuesRef.current(), path()); } catch { /* best effort */ }
    };
    const timer = setInterval(snapshot, intervalMs);
    return () => {
      clearInterval(timer);
      snapshot(); // final capture on close / unmount / navigation
      unregister();
    };
  }, [key, enabled, live, intervalMs]);
}

// ── Return-to (restore the page you were on after re-login) ──────────────────

export function saveReturnTo(path: string): void {
  if (typeof window === 'undefined') return;
  // Never bounce back to auth pages.
  if (!path.startsWith('/') || path.startsWith('/login') || path.startsWith('/portal/login')) return;
  try { sessionStorage.setItem(RETURN_TO_KEY, path); } catch { /* ignore */ }
}

/** Read and consume the stored return path (one-shot). */
export function takeReturnTo(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY);
    if (path) sessionStorage.removeItem(RETURN_TO_KEY);
    return path && path.startsWith('/') && !path.startsWith('/login') ? path : null;
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.removeItem(RETURN_TO_KEY); } catch { /* ignore */ }
}

// ── Why the session ended (drives the login-page banner) ─────────────────────
// Carried in sessionStorage rather than a URL param so a redirect race can't drop
// it (the app layout and the idle provider can both navigate to /login).

const REASON_KEY = 'cytolab-session-reason';

export function setSessionEndReason(reason: 'session_timeout' | 'session_expired'): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(REASON_KEY, reason); } catch { /* ignore */ }
}

/** Read and consume why the session ended (one-shot). */
export function takeSessionEndReason(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const reason = sessionStorage.getItem(REASON_KEY);
    if (reason) sessionStorage.removeItem(REASON_KEY);
    return reason;
  } catch {
    return null;
  }
}
