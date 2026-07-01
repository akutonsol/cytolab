import type { ReactNode } from 'react';
import { cn } from './cn';

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Small dim suffix rendered after the value, e.g. "/5" or a unit. */
  suffix?: string;
  /** Secondary line under the label, e.g. "Today", "This Month". */
  sublabel?: string;
  /** Small rounded icon chip shown inline with the label (iconed variant). */
  icon?: ReactNode;
  /** Top-right slot — typically a corner arrow / expand button. */
  action?: ReactNode;
  /** Elevated, primary-outlined state (the "active" card in a stat row). */
  active?: boolean;
  className?: string;
}

/**
 * Metric card. Plain variant = gray label + big bold number. Iconed variant adds
 * a rounded icon chip and a sublabel. One card in a row may be `active`
 * (elevated shadow + primary ring), matching the reference stat rows.
 */
export function StatCard({ label, value, suffix, sublabel, icon, action, active, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-2.5 rounded-card border border-card bg-surface p-5 transition-shadow',
        active ? 'shadow-card-hover ring-1 ring-primary/25' : 'shadow-card',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="flex h-7 w-7 items-center justify-center rounded-control bg-primary-soft text-primary">
                {icon}
              </span>
            )}
            <span className="text-label font-medium text-text-secondary">{label}</span>
          </div>
          {sublabel && <span className="text-meta text-text-tertiary">{sublabel}</span>}
        </div>
        {action}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-stat font-extrabold text-text">{value}</span>
        {suffix && <span className="text-sm font-medium text-text-tertiary">{suffix}</span>}
      </div>
    </div>
  );
}
