import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Card } from './Card';

/**
 * The "nothing here" surface. 21 near-identical copies existed:
 *
 *   <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#EEF2F7] bg-white
 *                   p-8 text-center shadow-sm">
 *     <Icon size={28} className="mx-auto text-[#9CA3AF]" />
 *     <div className="mt-3 text-[18px] font-bold text-[#0F172A]">…</div>
 *     <div className="mt-1 text-[14px] text-[#6B7280]">…</div>
 *   </div>
 *
 * 19 of them said "Feature not enabled". Every colour resolved to an existing token
 * (#9CA3AF = --color-icon-faint, #0F172A = --slate-900, #6B7280 = --color-text-secondary),
 * so this reproduces them pixel-for-pixel with no raw hex.
 *
 * Layout (`mt-16`) stays at the call site: it positions the card in its page, and is not
 * a property of the empty state.
 *
 * The table-empty row (`<td colSpan …>No records found.</td>`) is a *different* component —
 * see `TableEmpty`. Do not conflate them.
 */
type DescTone = 'secondary' | 'strong';

const DESC_TONE: Record<DescTone, string> = {
  secondary: 'text-text-secondary', // #6b7280 — 19 sites
  strong: 'text-text-strong', // #475569 — 2 sites
};

/**
 * Icon colour by presentation intent. `neutral` is the historical look (a faint icon for an
 * absence of data); `danger` tints only the icon for an error framing — the title/description
 * stay neutral, matching the route error boundary. Default is `neutral`, so it is inert.
 */
type Tone = 'neutral' | 'danger';

const ICON_TONE: Record<Tone, string> = {
  neutral: 'text-icon-faint',
  danger: 'text-error',
};

/**
 * Screen-reader announcement intent. This is PRESENTATION INTENT, not a state decision — the
 * page still decides whether it is showing an empty/error/forbidden surface and opts in:
 *   `status` → role="status" + aria-live="polite" (a non-urgent update, e.g. a load error a
 *              retry can fix). `alert` → role="alert" (assertive). Omitted → no ARIA is added,
 *              so every existing consumer renders byte-identically.
 */
type Announcement = 'status' | 'alert';

export interface EmptyStateProps {
  /** Rendered as-is; the call sites pass a Lucide icon at `size={28}`. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  descTone?: DescTone;
  /** Primary call to action (usually a <Button>). */
  action?: ReactNode;
  /** Drop the card chrome, e.g. when already inside a Card. */
  bare?: boolean;
  /** Icon colour intent. Defaults to `neutral` (unchanged look). */
  tone?: Tone;
  /** Opt in to a screen-reader announcement. Omitted = no ARIA (unchanged). */
  announcement?: Announcement;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  descTone = 'secondary',
  action,
  bare,
  tone = 'neutral',
  announcement,
  className,
}: EmptyStateProps) {
  // Additive only: with no `announcement`, `announce` is empty and nothing is spread.
  const announce: HTMLAttributes<HTMLElement> =
    announcement === 'status'
      ? { role: 'status', 'aria-live': 'polite' }
      : announcement === 'alert'
        ? { role: 'alert' }
        : {};

  const body = (
    <>
      {icon && <div className={cn('mx-auto', ICON_TONE[tone])}>{icon}</div>}
      <div className="mt-3 text-[18px] font-bold text-[var(--slate-900)]">{title}</div>
      {description && <div className={cn('mt-1 text-[14px]', DESC_TONE[descTone])}>{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </>
  );

  if (bare) return <div className={cn('text-center', className)} {...announce}>{body}</div>;

  return (
    <Card
      radius="md"
      elevation="sm"
      border="hairline"
      padding="xl"
      className={cn('mx-auto max-w-md text-center', className)}
      {...announce}
    >
      {body}
    </Card>
  );
}

/**
 * The table-empty row. 53 hand-written `<td colSpan …>` cells existed across six class
 * combinations; the axes below reproduce all of them.
 */
type EmptyPad = 'sm' | 'md' | 'lg';
type EmptyTone = 'muted' | 'strong' | 'reference';

const EMPTY_PAD: Record<EmptyPad, string> = {
  sm: 'px-3 py-12',
  md: 'px-4 py-12',
  lg: 'px-5 py-12',
};

const EMPTY_TONE: Record<EmptyTone, string> = {
  muted: 'text-sm text-slate-500',
  strong: 'text-text-strong', // #475569, no font-size — inherits, as the originals did
  reference: 'font-body-sm text-body-sm text-secondary',
};

export interface TableEmptyProps {
  colSpan: number;
  pad?: EmptyPad;
  tone?: EmptyTone;
  /** `py-10` instead of `py-12`. */
  tight?: boolean;
  className?: string;
  children: ReactNode;
}

export function TableEmpty({ colSpan, pad = 'md', tone = 'muted', tight, className, children }: TableEmptyProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={cn(EMPTY_PAD[pad], tight && 'py-10', 'text-center', EMPTY_TONE[tone], className)}
      >
        {children}
      </td>
    </tr>
  );
}
