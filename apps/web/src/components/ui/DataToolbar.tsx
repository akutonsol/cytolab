import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Data-surface toolbar (P4a). The layout frame that sits above a list/table: filters on the
 * leading edge, actions (and an optional result count) on the trailing edge.
 *
 * PRESENTATION ONLY. It owns spacing, alignment and responsive wrapping — nothing else. It
 * holds no state and makes no decisions: the page passes its own already-wired controls
 * (selects, date inputs, search, buttons, a count label) as `leading` / `trailing` / `count`,
 * and this component only arranges them. It never reads filters, never paginates, never counts.
 *
 * It is NOT a surface. Wrap it in a <Card> (or drop it into a Card header) when a surface is
 * wanted. It exists to collapse the ~25 hand-rolled
 * `flex flex-wrap items-center justify-between gap-3` toolbar rows onto one definition.
 *
 *   <Card padding="sm">
 *     <DataToolbar
 *       leading={<><DateRange …/><select …/></>}
 *       trailing={<Button>Export CSV</Button>}
 *     />
 *   </Card>
 *
 * With only `leading`, the single group is left-aligned (justify-between with one child). With
 * `trailing`/`count`, the two groups sit at opposite edges and wrap under each other on narrow
 * widths. `children` is an escape hatch: raw content in the justified row, page-owned grouping.
 */
type Gap = 'sm' | 'md';

const GAP: Record<Gap, string> = { sm: 'gap-2', md: 'gap-3' };

export interface DataToolbarProps {
  /** Leading controls (filters), grouped and left-aligned. */
  leading?: ReactNode;
  /** Trailing controls (actions), grouped and right-aligned. */
  trailing?: ReactNode;
  /** Optional result-count / status node, placed on the trailing edge before the actions. */
  count?: ReactNode;
  /** Gap between grouped items. */
  gap?: Gap;
  className?: string;
  /** Escape hatch: raw children in the justified row instead of the leading/trailing groups. */
  children?: ReactNode;
}

export function DataToolbar({ leading, trailing, count, gap = 'md', className, children }: DataToolbarProps) {
  const row = cn('flex flex-wrap items-center justify-between', GAP[gap], className);

  if (children !== undefined) {
    return <div className={row}>{children}</div>;
  }

  const hasTrailing = count !== undefined || trailing !== undefined;
  return (
    <div className={row}>
      <div className={cn('flex flex-wrap items-center', GAP[gap])}>{leading}</div>
      {hasTrailing && (
        <div className={cn('flex flex-wrap items-center', GAP[gap])}>
          {count}
          {trailing}
        </div>
      )}
    </div>
  );
}
