import type { ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_CLASS: Record<Variant, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutralbadge-soft text-neutralbadge',
};

// Maps the domain status labels seen across the references to a color family.
const STATUS_VARIANT: Record<string, Variant> = {};
const register = (v: Variant, labels: string[]) => labels.forEach((l) => (STATUS_VARIANT[l.toLowerCase()] = v));
register('success', ['Approved', 'Completed', 'Fixed', 'Paid', 'On time']);
register('warning', ['In Progress', 'Pending', 'Medium', 'Processing', 'Partial', 'Under']);
register('danger', ['Critical', 'Delayed', 'High', 'Urgent', 'Overdue', 'Failed', 'Over']);
register('info', ['Resulted', 'New', 'Submitted', 'In Transit']);
register('neutral', ['Low', 'Normal', 'Draft', 'Disabled', 'Viewed']);

interface StatusBadgeProps {
  /** Status label; auto-mapped to a color unless `variant` is given. */
  status: string;
  variant?: Variant;
  /** Optional leading icon (⚠ on Critical, ✓ on Completed, truck on In Transit …). */
  icon?: ReactNode;
  /** Show a small leading dot instead of an icon. */
  dot?: boolean;
  className?: string;
}

/** Soft-filled status pill: tinted background + saturated same-hue text. */
export function StatusBadge({ status, variant, icon, dot, className }: StatusBadgeProps) {
  const resolved = variant ?? STATUS_VARIANT[status.toLowerCase()] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none',
        VARIANT_CLASS[resolved],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {icon && <span className="text-[11px]">{icon}</span>}
      {status}
    </span>
  );
}
