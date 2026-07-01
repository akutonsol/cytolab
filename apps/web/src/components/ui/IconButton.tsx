import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'dark' | 'light' | 'primary' | 'soft';
type Size = 'sm' | 'md';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  dark: 'bg-text text-white hover:opacity-90',
  light: 'bg-surface text-text-secondary border border-border-strong hover:text-text hover:border-text/30',
  primary: 'bg-primary text-primary-on hover:bg-primary-hover',
  soft: 'bg-primary-soft text-primary hover:bg-primary/15',
};
const SIZES: Record<Size, string> = { sm: 'h-8 w-8 text-[13px]', md: 'h-10 w-10 text-[15px]' };

/** Circular icon button — the corner-arrow / expand / action control recurring across the cards. */
export function IconButton({ icon, variant = 'light', size = 'md', className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
