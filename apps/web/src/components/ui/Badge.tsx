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
type Size = 'sm' | 'md';

const TONE: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutralbadge-soft text-neutralbadge',
  primary: 'bg-primary-soft text-primary',
};

const SIZE: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** A Tier-2.5 domain token stem, e.g. `workflow-complete`, `specimen-urine`. */
  domain?: string;
  size?: Size;
  /** Leading status dot in the current text colour. */
  dot?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Badge({ tone, domain, size = 'md', dot, icon, className, children, style, ...rest }: BadgeProps) {
  const domainStyle = domain
    ? { background: `var(--${domain}-soft)`, color: `var(--${domain})` }
    : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill font-semibold leading-none',
        SIZE[size],
        !domain && TONE[tone ?? 'neutral'],
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
