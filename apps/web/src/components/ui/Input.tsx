import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Text field primitive. Consolidates the 7 hand-written `const INPUT` strings, which
 * came in three shapes:
 *
 *   A (x4, portal)  h-11 rounded-xl border-#E2E8F0 px-3.5 text-[14px] text-#0F172A
 *   B (x2, panes)   h-11 rounded-xl border-outline-variant/40 px-3.5 font-body-sm …
 *   C (x1, editor)  rounded-lg border-#E2E8F0 px-3 py-2.5 text-[14px] — no fixed height
 *
 * Every axis below exists to reproduce one of those exactly. Defaults = shape A.
 *
 * ── Focus ────────────────────────────────────────────────────────────────────────
 * The app's focus treatment was border-colour only (~116 sites). This primitive keeps
 * that on `:focus` and adds a ring on `:focus-visible`.
 *
 * NOTE — `:focus-visible` matches a text input on a MOUSE CLICK, not only on keyboard
 * focus: browsers always show a focus indicator for text entry. So the ring is visible
 * to every user, not just keyboard users. That is an intentional, approved focus-state
 * change. It is invisible to a static screenshot diff (nothing is focused in a
 * screenshot), so it is verified by driving the state — see `_states.mjs` in the
 * Sprint 6 verification, and DESIGN_SYSTEM §8k.
 *
 * `disabled` and `readOnly` are intentionally left to native rendering: none of the
 * migrated fields styled them.
 *
 * ── States ───────────────────────────────────────────────────────────────────────
 * `disabled` and `readOnly` are deliberately left to the browser's native rendering:
 * none of the migrated fields styled them, and inventing styling here would be a
 * redesign. `invalid` / `valid` set the border and the correct ARIA.
 */
type Size = 'sm' | 'md' | 'lg' | 'auto';
type Radius = 'lg' | 'xl';
type Family = 'slate' | 'reference';
type Border = 'field' | 'outline';

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3',
  md: 'h-10 px-3',
  lg: 'h-11 px-3.5',
  auto: 'px-3 py-2.5', // shape C: height follows content
};

const RADIUS: Record<Radius, string> = {
  lg: 'rounded-lg',
  xl: 'rounded-xl',
};

const FAMILY: Record<Family, string> = {
  slate: 'text-[14px] text-field-text',
  reference: 'font-body-sm text-body-sm text-on-surface',
};

const BORDER: Record<Border, string> = {
  field: 'border-field-border',
  // The reference panes use a translucent outline. Kept as its own variant rather
  // than converged — see DESIGN_SYSTEM §8i (two typography/colour families).
  outline: 'border-outline-variant/40',
};

export interface FieldStyle {
  inputSize?: Size;
  radius?: Radius;
  family?: Family;
  border?: Border;
  surface?: boolean;
  invalid?: boolean;
  valid?: boolean;
}

/**
 * The field class string, for controls that are not `<input>` — `<select>` and
 * `<textarea>` share the exact same shell in this codebase. Use this instead of
 * copying the classes, so the shell has one definition.
 *
 *   <select className={fieldClass({ family: 'reference' })} />
 */
export function fieldClass({
  inputSize = 'lg',
  radius = 'xl',
  family = 'slate',
  border = 'field',
  surface = true,
  invalid,
  valid,
}: FieldStyle = {}) {
  return cn(
    'w-full border outline-none',
    'transition-colors duration-fast ease-standard',
    SIZE[inputSize],
    RADIUS[radius],
    FAMILY[family],
    BORDER[border],
    surface && 'bg-surface',
    invalid ? 'border-danger focus:border-danger' : valid ? 'border-success focus:border-success' : 'focus:border-primary',
    'focus-visible:ring-2 focus-visible:ring-[var(--color-primary-soft)]',
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  inputSize?: Size;
  radius?: Radius;
  family?: Family;
  border?: Border;
  /** Paint the field background. Shape C is transparent. */
  surface?: boolean;
  /** Rendered inside the field, before the input. Named `addon` because `prefix` is a
   *  real HTML attribute typed as `string`. */
  addon?: ReactNode;
  invalid?: boolean;
  valid?: boolean;
}

export function Input({
  inputSize = 'lg',
  radius = 'xl',
  family = 'slate',
  border = 'field',
  surface = true,
  addon,
  invalid,
  valid,
  className,
  ...rest
}: InputProps) {
  // Keyboard-only ring lives inside fieldClass(): invisible to mouse users, so no
  // static pixel change.
  const shell = cn(fieldClass({ inputSize, radius, family, border, surface, invalid, valid }), className);

  if (!addon) {
    return <input className={shell} aria-invalid={invalid || undefined} {...rest} />;
  }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 border outline-none',
        'transition-colors duration-fast ease-standard',
        SIZE[inputSize],
        RADIUS[radius],
        BORDER[border],
        surface && 'bg-surface',
        invalid
          ? 'border-danger focus-within:border-danger'
          : valid
            ? 'border-success focus-within:border-success'
            : 'focus-within:border-primary',
        'focus-within:has-[:focus-visible]:ring-2 focus-within:has-[:focus-visible]:ring-[var(--color-primary-soft)]',
        className,
      )}
    >
      <span className="shrink-0 text-text-tertiary">{addon}</span>
      <input
        className={cn('h-full w-full bg-transparent outline-none', FAMILY[family])}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </div>
  );
}
