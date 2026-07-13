import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn } from './cn';

/**
 * Search field (P4b). A labelled search-input shell — PRESENTATION ONLY.
 *
 * It owns only the field chrome and its accessibility wiring: an associated label (visible or
 * screen-reader-only), an optional leading node (defaults to a search icon), and optional
 * description / error text wired via aria-describedby / aria-invalid. It holds no state and no
 * hooks-of-consequence (only useId for label association).
 *
 * The PAGE keeps everything that is behaviour: `value`, `onChange`, `onKeyDown`, debounce,
 * search execution, filtering, clearing, URL/query state and result-state determination — all
 * passed straight through `inputProps` onto the native <input>. There is no built-in debounce,
 * clear button, hotkey, or search trigger here.
 *
 *   <SearchField
 *     label="Search patients" hideLabel
 *     className="h-12 w-[360px]"
 *     inputProps={{ value: term, onChange: (e) => setTerm(e.target.value),
 *                   onKeyDown: (e) => { if (e.key === 'Enter') runSearch(); },
 *                   placeholder: 'Search name, reg no, email, phone' }}
 *   />
 */
export interface SearchFieldProps {
  /** Accessible name, rendered as a real <label>. Omit only if `inputProps['aria-label']` is set. */
  label?: ReactNode;
  /** Keep the label in the accessibility tree but hide it visually (sr-only). */
  hideLabel?: boolean;
  /** Optional helper text under the field (wired via aria-describedby). */
  description?: ReactNode;
  /** Optional error text under the field (wired via aria-describedby + aria-invalid). */
  error?: ReactNode;
  /** Leading content inside the shell. Defaults to a search icon; pass `null` to omit. */
  leading?: ReactNode;
  /** Native input props — the PAGE owns value/onChange/onKeyDown/placeholder/etc. */
  inputProps: InputHTMLAttributes<HTMLInputElement>;
  /** Class for the field shell (e.g. width/height to match an existing search box). */
  className?: string;
  /** Class for the <input> itself. */
  inputClassName?: string;
}

const SHELL =
  'flex h-11 items-center gap-2 rounded-xl border border-outline-variant/40 bg-white px-4 text-secondary';
const INPUT =
  'w-full border-none bg-transparent font-body-sm text-body-sm text-on-surface outline-none placeholder:text-outline';

export function SearchField({
  label,
  hideLabel,
  description,
  error,
  leading,
  inputProps,
  className,
  inputClassName,
}: SearchFieldProps) {
  const autoId = useId();
  const id = inputProps.id ?? autoId;
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy =
    [inputProps['aria-describedby'], descId, errId].filter(Boolean).join(' ') || undefined;
  const leadingNode = leading === undefined ? <Search size={18} /> : leading;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className={cn('font-label-sm text-label-sm text-secondary', hideLabel && 'sr-only')}>
          {label}
        </label>
      )}
      <div className={cn(SHELL, className)}>
        {leadingNode && <span className="flex shrink-0 items-center">{leadingNode}</span>}
        <input
          {...inputProps}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : inputProps['aria-invalid']}
          className={cn(INPUT, inputClassName)}
        />
      </div>
      {description && (
        <p id={descId} className="font-body-sm text-body-sm text-secondary">
          {description}
        </p>
      )}
      {error && (
        <p id={errId} className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
