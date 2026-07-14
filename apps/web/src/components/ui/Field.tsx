import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Form field wrapper (P7). PRESENTATION ONLY — a label, an optional required indicator, an
 * optional description and an optional error, plus the vertical spacing around one control.
 *
 * It injects NOTHING onto the child. The page keeps everything with behaviour: the control's
 * `id`, `value`, `onChange`, validation, requiredness, `aria-invalid`, mutation and submission.
 * Field renders a `<label htmlFor>` that the page associates by setting the SAME id on its own
 * control — there is no cloneElement, no generated id, no automatic ARIA. `required` only draws
 * the visual `*`; whether a field is required stays a page decision. `error` is rendered as
 * page-supplied text; Field never decides that an error exists.
 *
 *   <Field label="Name" htmlFor="dept-name" required>
 *     <input id="dept-name" value={name} onChange={…} />
 *   </Field>
 */
export interface FieldProps {
  label: ReactNode;
  /** Associates the label with the control. The page must set the same id on its control. */
  htmlFor?: string;
  /** Draws the visual required indicator only. Requiredness stays page-owned. */
  required?: boolean;
  /** Optional helper text, under the label. */
  description?: ReactNode;
  /** Optional error text, under the control. Page-supplied — Field never infers it. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, description, error, className, children }: FieldProps) {
  return (
    <div className={cn(className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block font-label-md text-label-md text-on-surface">
        {label}
        {required && <span className="text-error"> *</span>}
      </label>
      {description && <p className="mb-1.5 text-body-sm text-secondary">{description}</p>}
      {children}
      {error && <p className="mt-1.5 text-body-sm text-error">{error}</p>}
    </div>
  );
}
