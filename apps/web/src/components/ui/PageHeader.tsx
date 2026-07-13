'use client';

// Shared page header primitive (P3). ONE reusable presentation for the top of a page:
// a single <h1>, an optional eyebrow/context label, a description, a metadata slot, an
// optional back/return affordance, and a right-aligned actions slot. Layout + accessibility
// only — it never fetches data, checks permissions, routes, or holds business logic. Pages
// pass their own already-wired nodes into `back` / `actions` (so behaviour is unchanged) and
// this primitive only decides how they are arranged, sized, and stacked responsively.
//
// Heading hierarchy: this renders the page's ONE <h1>. Do not render another on the same page.
//
// Return-aware workspaces (which focus the heading on entry and via a keyboard shortcut) pass
// their existing `titleRef` and set `focusableTitle` — the ref + tabIndex live on the same <h1>
// this primitive owns, so the focus-on-entry and shortcut behaviour is preserved exactly.
//
//   <PageHeader
//     title="Laboratory Operations"
//     description="Live command center for the floor."
//     actions={<Button>…</Button>}
//   />

import type { ReactNode, RefObject } from 'react';
import { cn } from './cn';

export interface PageHeaderProps {
  /** The page's single <h1>. Required. */
  title: ReactNode;
  /** Forwarded to the <h1> — for return-aware workspaces that focus the heading. */
  titleRef?: RefObject<HTMLHeadingElement>;
  /** Make the <h1> programmatically focusable (tabIndex=-1) with a keyboard focus ring. */
  focusableTitle?: boolean;
  /** Small context label rendered above the title (e.g. a section or workspace name). */
  eyebrow?: ReactNode;
  /** One-line supporting copy under the title. */
  description?: ReactNode;
  /** Metadata row rendered under the description (chips, timestamps, counts …). */
  meta?: ReactNode;
  /** A back/return affordance rendered above the title (page passes its own wired control). */
  back?: ReactNode;
  /** Right-aligned actions (page passes its own wired controls). Wraps under the title on narrow widths. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  titleRef,
  focusableTitle = false,
  eyebrow,
  description,
  meta,
  back,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6', className)}>
      {back && <div className="mb-2">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-text-tertiary">{eyebrow}</div>
          )}
          <h1
            ref={titleRef}
            tabIndex={focusableTitle ? -1 : undefined}
            className={cn(
              'text-[26px] font-bold leading-tight tracking-tight text-charcoal-heading [overflow-wrap:break-word] sm:text-[30px]',
              focusableTitle &&
                'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2',
            )}
          >
            {title}
          </h1>
          {description && <p className="mt-1 max-w-3xl text-sm text-secondary">{description}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:gap-3">{actions}</div>}
      </div>
    </header>
  );
}
