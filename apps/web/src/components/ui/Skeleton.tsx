import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Loading placeholders.
 *
 * These exist because the product's real failure was not blank screens — it was
 * **false empty states**. `/records` rendered "0 samples · 0% authorized · ✓ No urgent
 * cases" while its data was still in flight. A zero is indistinguishable from
 * "not loaded", so the user is shown a confident lie instead of a wait.
 *
 * Rules (Experience Principles §1, §7):
 *   - A skeleton mirrors the SHAPE of the content it replaces. It never invents rows.
 *   - It appears immediately. There is no "delay before showing the skeleton".
 *   - The shimmer is driven by a duration token, so `prefers-reduced-motion` reaches it
 *     (99 of the app's existing keyframes do not — DESIGN_SYSTEM/EXPERIENCE_REPORT).
 */
type Shape = 'text' | 'block' | 'circle' | 'pill';

const SHAPE: Record<Shape, string> = {
  text: 'h-4 rounded-md',
  block: 'rounded-lg',
  circle: 'rounded-full',
  pill: 'rounded-pill h-6',
};

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  shape?: Shape;
  /** Tailwind width class, e.g. `w-32`, `w-full`. */
  width?: string;
  /** Tailwind height class; ignored for `text`/`pill` which are fixed. */
  height?: string;
}

export function Skeleton({ shape = 'block', width = 'w-full', height, className, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn('skeleton-shimmer bg-surface-3', SHAPE[shape], width, height, className)}
      {...rest}
    />
  );
}

/** N lines of text, last one short — the shape real prose actually has. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} shape="text" width={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

/**
 * Table body placeholder. `columns` must match the real header, so the column widths do
 * not jump when the data lands (Experience Principle §6: no layout shift on arrival).
 */
export function SkeletonRows({ rows = 6, columns, className }: { rows?: number; columns: number; className?: string }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className={className}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-4">
              <Skeleton shape="text" width={c === 0 ? 'w-3/4' : 'w-1/2'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** KPI/stat card placeholder: label line, value block, sub line. */
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Skeleton shape="text" width="w-24" className="h-3" />
      <Skeleton shape="block" width="w-20" height="h-8" />
      <Skeleton shape="text" width="w-16" className="h-3" />
    </div>
  );
}
