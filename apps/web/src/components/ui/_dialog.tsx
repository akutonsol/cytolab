'use client';

// Shared accessibility engine for the Modal + Drawer primitives (P2).
// Behaviour only — no styling, no domain logic. Both primitives compose this so
// focus-trap / Escape / scroll-lock / focus-restore / nested-overlay behaviour is
// implemented once and identically.

import { useEffect, useRef, type RefObject } from 'react';

// A module-level stack of open dialogs. Only the TOPMOST dialog reacts to Escape and
// owns the focus trap, so nested overlays (a confirm inside a drawer) behave correctly.
const openStack: symbol[] = [];

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
  );
}

// Entrance keyframes injected once (client-only). Durations come from the motion
// tokens, so `prefers-reduced-motion` (which collapses --duration-* to 1ms) reaches
// them automatically — no separate reduced-motion rule needed.
const DIALOG_CSS = `
@keyframes ui-scrim-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes ui-modal-in { from { opacity: 0; transform: translateY(8px) scale(0.985) } to { opacity: 1; transform: none } }
@keyframes ui-drawer-in-right { from { transform: translateX(100%) } to { transform: none } }
@keyframes ui-drawer-in-left { from { transform: translateX(-100%) } to { transform: none } }
.ui-scrim { animation: ui-scrim-in var(--duration-fast, 120ms) var(--ease-out, ease) both }
.ui-modal-panel { animation: ui-modal-in var(--duration-base, 200ms) var(--ease-emphasized, ease) both }
.ui-drawer-right { animation: ui-drawer-in-right var(--duration-slow, 320ms) var(--ease-emphasized, ease) both }
.ui-drawer-left { animation: ui-drawer-in-left var(--duration-slow, 320ms) var(--ease-emphasized, ease) both }
`;
let stylesInjected = false;
function ensureDialogStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const el = document.createElement('style');
  el.id = 'ui-dialog-styles';
  el.textContent = DIALOG_CSS;
  document.head.appendChild(el);
}

export function useDialog(opts: {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement>;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
}) {
  const { open, onClose, panelRef, closeOnEscape = true, initialFocusRef } = opts;
  const idRef = useRef<symbol>();
  if (!idRef.current) idRef.current = Symbol('dialog');
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  ensureDialogStyles();

  // Body scroll lock. The document scrolls on <html>/<body>, so locking body overflow
  // is correct; the scrollbar-width pad prevents a horizontal layout shift (the app runs
  // classic/space-consuming scrollbars). Stacked dialogs restore in LIFO order.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPad = body.style.paddingRight;
    const sw = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (sw > 0) body.style.paddingRight = `${sw}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPad;
    };
  }, [open]);

  // Escape (topmost only) + Tab focus trap.
  useEffect(() => {
    if (!open) return;
    const id = idRef.current!;
    openStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return; // only the topmost dialog acts
      if (e.key === 'Escape') {
        if (closeOnEscape) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const items = focusable(panel);
        if (!items.length) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !panel.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
    };
  }, [open, closeOnEscape, panelRef]);

  // Initial focus into the dialog; restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      const target = initialFocusRef?.current ?? (panel ? focusable(panel)[0] ?? panel : null);
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      // Restore focus only if it is still inside the (now closing) dialog, so we never
      // yank focus away from wherever the user legitimately moved it.
      prevActive?.focus?.();
    };
  }, [open, panelRef, initialFocusRef]);
}
