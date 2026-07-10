import type { ReactNode } from 'react';
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
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  descTone = 'secondary',
  action,
  bare,
  className,
}: EmptyStateProps) {
  const body = (
    <>
      {icon && <div className="mx-auto text-icon-faint">{icon}</div>}
      <div className="mt-3 text-[18px] font-bold text-[var(--slate-900)]">{title}</div>
      {description && <div className={cn('mt-1 text-[14px]', DESC_TONE[descTone])}>{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </>
  );

  if (bare) return <div className={cn('text-center', className)}>{body}</div>;

  return (
    <Card
      radius="md"
      elevation="sm"
      border="hairline"
      padding="xl"
      className={cn('mx-auto max-w-md text-center', className)}
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
