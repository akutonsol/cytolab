'use client';

// Shared accessible Drawer primitive (P2). A side-anchored dialog for detail panels and
// forms — NOT for dropdowns or panels that are a permanent part of the layout. Presentation
// + accessibility only; controlled via `open` / `onOpenChange`. Composes <Portal> + useDialog
// for focus-trap, Escape, scroll-lock, focus-restore, and nested-overlay safety.
//
//   <Drawer open={open} onOpenChange={setOpen} title="Recall detail" side="right"
//           footer={<>…actions…</>}>
//     …scrollable body…
//   </Drawer>

import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Portal } from './Portal';
import { useDialog } from './_dialog';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name (rendered in the sticky header and wired to aria-labelledby). Required. */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky action area at the bottom. */
  footer?: ReactNode;
  side?: 'right' | 'left';
  /** Desktop width. On phones the drawer always goes full-width (`w-full`) so it is usable. */
  width?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  hideClose?: boolean;
  initialFocusRef?: RefObject<HTMLElement>;
}

const WIDTH: Record<NonNullable<DrawerProps['width']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  width = 'md',
  closeOnBackdrop = true,
  closeOnEscape = true,
  hideClose = false,
  initialFocusRef,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const close = () => onOpenChange(false);
  useDialog({ open, onClose: close, panelRef, closeOnEscape, initialFocusRef });

  if (!open) return null;

  return (
    <Portal>
      <div
        className={`ui-scrim fixed inset-0 z-[1000] flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}
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
          className={`${side === 'right' ? 'ui-drawer-right' : 'ui-drawer-left'} flex h-full w-full flex-col overflow-hidden bg-surface shadow-2xl outline-none ${WIDTH[width]}`}
        >
          <div className="flex items-start justify-between gap-4 border-b border-card px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-text">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-card px-5 py-4">{footer}</div>
          )}
        </div>
      </div>
    </Portal>
  );
}
