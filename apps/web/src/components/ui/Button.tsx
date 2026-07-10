import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

/**
 * The action primitive. 132 call sites already use the global `.btn-primary` /
 * `.btn-secondary` / `.btn-ghost` / `.btn-outline` classes, so this component
 * *wraps* them rather than re-implementing: adoption is therefore pixel-identical
 * by construction, and the CSS stays the single source of truth for those shapes.
 *
 * `danger` is the one variant with no global class — the app expressed it as
 * `.btn-primary` plus an inline red background in each place.
 *
 * Hover/press/focus timing comes from --motion-hover / --motion-press /
 * --motion-focus (see globals.css). Focus rings are handled by `.btn-*:focus-visible`.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline: 'btn-outline',
  // Destructive: same geometry as primary, danger fill.
  danger: 'btn-primary bg-[var(--red-600)] hover:brightness-110',
};

/** `md` is the shape baked into the .btn-* classes; `sm` compacts it. */
const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: '',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Rendered before the label. */
  icon?: ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
  /**
   * In-flight. Swaps the leading icon for a spinner and disables the button.
   *
   * The label is NOT replaced with "Saving…": the button must not change width
   * mid-click, or the pointer ends up over a different control (Experience
   * Principle §6, no layout shift). Callers that want a verb change should pass
   * `loadingLabel`.
   */
  loading?: boolean;
  loadingLabel?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  loading = false,
  loadingLabel,
  disabled,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        VARIANT[variant],
        SIZE[size],
        block && 'w-full justify-center',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

/**
 * Compact button class string. The Security Center ships a smaller button than the
 * global `.btn-*` family (rounded-lg, 12px text, py-1.5) and applies it to both
 * `<button>` and `<a>`. Exporting the builder gives that shape ONE definition without
 * changing its geometry — the same escape hatch as `cardClass()` and `fieldClass()`.
 *
 * It is convergence debt, not a second button system: see DESIGN_SYSTEM §8n.
 */
type CompactTone = 'primary' | 'ghost' | 'danger';

const COMPACT: Record<CompactTone, string> = {
  primary: 'bg-indigo-600 px-3.5 py-2 text-white hover:bg-indigo-700',
  ghost: 'border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:bg-slate-50',
  danger: 'border border-red-200 bg-white px-3 py-1.5 text-red-600 hover:bg-red-50',
};

export function compactButtonClass(tone: CompactTone = 'ghost') {
  return cn('inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold', COMPACT[tone]);
}

/**
 * Icon-only action button — the `grid h-N w-N place-items-center rounded-*` shape
 * repeated 178 times across the app. Distinct from `IconButton` (fixed circle) and
 * from the 141 *decorative* icon tiles, which are spans and not interactive.
 *
 * The tone axis is three luminance tiers, measured from the real call sites:
 * five grey values were in use, but they cluster into strong / muted / faint
 * (ΔL within a tier = 0.004, imperceptible; across tiers 0.275, clearly visible).
 * 21 call sites sit slightly off-tier (`#64748b`, `#94a3b8`); they carry an explicit
 * `className` override so this migration is pixel-identical. Converging them is a
 * separate, reviewable recolour pass — see DESIGN_SYSTEM §8h.
 */
type IconTone = 'strong' | 'muted' | 'faint' | 'primary' | 'danger' | 'inverse';
type IconSize = 'sm' | 'md' | 'lg' | 'xl';
type IconShape = 'square' | 'soft' | 'circle';

/** Foreground only. The hover fill is a separate axis: 16 of the 159 icon buttons
 *  in the app have no hover fill at all, and baking one in would change behaviour. */
const ICON_FG: Record<IconTone, string> = {
  strong: 'text-icon-strong',
  muted: 'text-icon-muted',
  faint: 'text-icon-faint',
  primary: 'text-primary',
  danger: 'text-danger',
  inverse: 'text-white',
};

const ICON_HOVER: Record<IconTone, string> = {
  strong: 'hover:bg-icon-hover',
  muted: 'hover:bg-icon-hover',
  faint: 'hover:bg-icon-hover',
  primary: 'hover:bg-primary-soft',
  danger: 'hover:bg-danger-soft',
  inverse: 'hover:bg-white/10',
};

const ICON_SIZE: Record<IconSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-9 w-9',
  xl: 'h-10 w-10',
};

const ICON_SHAPE: Record<IconShape, string> = {
  square: 'rounded-lg',
  soft: 'rounded-xl',
  circle: 'rounded-full',
};

export interface IconActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tone?: IconTone;
  size?: IconSize;
  shape?: IconShape;
  /** Tinted background on hover. `false` for the 16 call sites that never had one. */
  hover?: boolean;
}

export function IconAction({
  icon,
  tone = 'muted',
  size = 'md',
  shape = 'square',
  hover = true,
  className,
  type = 'button',
  ...rest
}: IconActionProps) {
  return (
    <button
      type={type}
      className={cn(
        'grid place-items-center',
        ICON_SIZE[size],
        ICON_SHAPE[shape],
        'transition-colors duration-fast ease-standard',
        // shared press gesture — see globals.css "THE MOTION GRAMMAR"
        'helix-press',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ICON_FG[tone],
        hover && ICON_HOVER[tone],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
