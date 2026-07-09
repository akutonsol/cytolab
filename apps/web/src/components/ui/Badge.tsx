import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Soft-filled pill. Consolidates ~130 hand-rolled
 * `rounded-full px-2.5 py-1 text-[11px] font-bold` spans.
 *
 * Two ways to colour it, and only two:
 *
 *   <Badge tone="success">Paid</Badge>            // Tier 2 — UI semantics
 *   <Badge domain="workflow-complete">Approved</Badge>  // Tier 2.5 — business meaning
 *
 * `domain` is the preferred form for anything that encodes lab data. It expands to
 * `var(--<name>)` / `var(--<name>-soft)`, so a component still never names a hue,
 * and re-theming a status is a one-token change in globals.css.
 *
 * (This is deliberately a *string* rather than a union of every domain token: the
 * families grow per product, and the token layer is the source of truth. A typo
 * yields an unresolved var, which is loud in review — not a silent wrong colour.)
 */
type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';
type Size = 'xs' | 'sm' | 'md' | 'lg';
/** The app ships pills at three weights; `semibold` is the status-pill default. */
type Weight = 'normal' | 'medium' | 'semibold';

const TONE: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutralbadge-soft text-neutralbadge',
  primary: 'bg-primary-soft text-primary',
};

const SIZE: Record<Size, string> = {
  xs: 'px-2 py-0.5 text-[11px] leading-none',
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs leading-none',
  lg: 'px-3 py-1 text-sm',
};

const WEIGHT: Record<Weight, string> = {
  normal: '',
  medium: 'font-medium',
  semibold: 'font-semibold',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** A Tier-2.5 domain token stem, e.g. `workflow-complete`, `specimen-urine`. */
  domain?: string;
  size?: Size;
  weight?: Weight;
  /** Leading status dot in the current text colour. */
  dot?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Badge({ tone, domain, size = 'md', weight = 'semibold', dot, icon, className, children, style, ...rest }: BadgeProps) {
  const domainStyle = domain
    ? { background: `var(--${domain}-soft)`, color: `var(--${domain})` }
    : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill',
        // gap only when there is something to sit beside the label — a bare pill
        // must be geometrically identical to the hand-written spans it replaces.
        (dot || icon) && 'gap-1.5',
        SIZE[size],
        WEIGHT[weight],
        // `tone` is skipped when neither tone nor domain is given: the call site is
        // supplying its own colour classes (the legacy pill shells did exactly this).
        !domain && tone && TONE[tone],
        className,
      )}
      style={{ ...domainStyle, ...style }}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {icon}
      {children}
    </span>
  );
}
