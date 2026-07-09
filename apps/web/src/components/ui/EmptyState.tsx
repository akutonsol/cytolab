import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The "nothing here yet" surface. The app hand-wrote this ~21 times as
 * `rounded-2xl border border-[#EEF2F7] bg-white p-8 text-center shadow-sm`
 * plus an icon, a headline and an optional action.
 *
 * Entrance uses --motion-entrance; it is skipped entirely under
 * `prefers-reduced-motion` because the duration tokens collapse to 1ms.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Primary call to action (usually a <Button>). */
  action?: ReactNode;
  /** Render without the card chrome, e.g. inside an existing Card. */
  bare?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, description, action, bare, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8 text-center',
        !bare && 'rounded-2xl border border-lightgray bg-surface shadow-sm',
        className,
      )}
    >
      {icon && (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-text-tertiary">
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <h3 className="text-section text-text">{title}</h3>
        {description && <p className="max-w-sm text-small text-text-secondary">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
