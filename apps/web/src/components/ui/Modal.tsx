'use client';

// Shared accessible Modal primitive (P2). Presentation + accessibility only — it holds
// no domain logic. Controlled via `open` / `onOpenChange`. Composes <Portal> + useDialog
// for focus-trap, Escape, scroll-lock, focus-restore, and nested-overlay safety.
//
//   <Modal open={open} onOpenChange={setOpen} title="Delete workspace?" tone="danger"
//          description="This cannot be undone." footer={<>…buttons…</>}>
//     …optional body…
//   </Modal>

import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Portal } from './Portal';
import { useDialog } from './_dialog';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name (rendered as the <h2> and wired to aria-labelledby). Required. */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action area (buttons). Rendered right-aligned in a bordered footer. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** `danger` tints the title for destructive confirmations (never colour-only — the
   *  copy still carries the meaning). */
  tone?: 'default' | 'danger';
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  hideClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'default',
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideClose = false,
  initialFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const close = () => onOpenChange(false);
  useDialog({ open, onClose: close, panelRef, closeOnEscape, initialFocusRef });

  if (!open) return null;

  return (
    <Portal>
      <div
        className="ui-scrim fixed inset-0 z-[1000] flex items-center justify-center p-4 sm:p-6"
        style={{ background: 'rgba(15, 23, 42, 0.45)' }}
        onMouseDown={(e) => {
          if (closeOnBackdrop && e.target === e.currentTarget) close();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={`ui-modal-panel flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl outline-none ${SIZE[size]}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-card px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className={`text-base font-bold ${tone === 'danger' ? 'text-danger' : 'text-text'}`}>
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm leading-relaxed text-text-secondary">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-lightgray hover:text-text"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {children != null && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-card px-5 py-4">{footer}</div>
          )}
        </div>
      </div>
    </Portal>
  );
}
