import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Text field primitive. Consolidates the 7 `const INPUT = '…'` strings, whose
 * dominant shape was:
 *   'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm
 *    text-slate-600 outline-none focus:border-primary'
 *
 * Adds a real focus ring (the hand-rolled versions only shifted border colour)
 * and routes the transition through --motion-focus.
 */
type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-10 px-3 text-sm',
  lg: 'h-11 px-3.5 text-sm',
};

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  inputSize?: Size;
  /** Rendered inside the field, before the input (search glyph, etc.).
   *  Named `addon` because `prefix` is a real HTML attribute typed as `string`. */
  addon?: ReactNode;
  invalid?: boolean;
}

export function Input({ inputSize = 'md', addon, invalid, className, ...rest }: InputProps) {
  const field = (
    <input
      className={cn(
        'w-full bg-transparent text-text outline-none placeholder:text-placeholder',
        !addon && SIZE[inputSize],
        addon && 'h-full',
        !addon && 'rounded-input border border-border-strong bg-surface',
        !addon && 'transition-[border-color,box-shadow] duration-fast ease-standard',
        !addon && !invalid && 'focus:border-primary focus:shadow-[0_0_0_3px_var(--color-primary-soft)]',
        !addon && invalid && 'border-danger focus:shadow-[0_0_0_3px_var(--color-danger-soft)]',
        !addon && className,
      )}
      {...rest}
    />
  );

  if (!addon) return field;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-input border border-border-strong bg-surface',
        'transition-[border-color,box-shadow] duration-fast ease-standard',
        invalid
          ? 'border-danger focus-within:shadow-[0_0_0_3px_var(--color-danger-soft)]'
          : 'focus-within:border-primary focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)]',
        SIZE[inputSize],
        className,
      )}
    >
      <span className="shrink-0 text-text-tertiary">{addon}</span>
      {field}
    </div>
  );
}
