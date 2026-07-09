import type { ButtonHTMLAttributes, ReactNode } from 'react';
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
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  block,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        VARIANT[variant],
        SIZE[size],
        block && 'w-full justify-center',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Square icon action — the `grid h-8 w-8 place-items-center rounded-lg` shape
 * repeated ~45 times. Distinct from `IconButton`, which is circular.
 */
type IconTone = 'muted' | 'primary' | 'danger';

const ICON_TONE: Record<IconTone, string> = {
  muted: 'text-slate-600 hover:bg-slate-100',
  primary: 'text-primary hover:bg-primary-soft',
  danger: 'text-danger hover:bg-danger-soft',
};

export interface IconActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  tone?: IconTone;
}

export function IconAction({ icon, tone = 'muted', className, type = 'button', ...rest }: IconActionProps) {
  return (
    <button
      type={type}
      className={cn(
        'grid h-8 w-8 place-items-center rounded-lg',
        'transition-colors duration-fast ease-standard',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ICON_TONE[tone],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
