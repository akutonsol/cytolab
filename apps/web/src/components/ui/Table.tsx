import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Low-level table parts. Consolidates the 11 `const TH` and 11 `const CELL`
 * strings copied between screens.
 *
 * Deliberately *not* a rendering abstraction: the screens differ in row shape,
 * click behaviour and colspan logic, and a `<DataTable>` already exists for the
 * cases that are uniform. These give one definition of the header and cell
 * geometry without forcing anyone to restructure their markup.
 *
 * `density` is the knob the copies actually differed on: records used px-4/py-4,
 * patients px-8/py-5.
 */
type Density = 'compact' | 'default' | 'roomy';

const TH_DENSITY: Record<Density, string> = {
  compact: 'px-4 py-3',
  default: 'px-6 py-4',
  roomy: 'px-8 py-4',
};

const TD_DENSITY: Record<Density, string> = {
  compact: 'px-4 py-4',
  default: 'px-6 py-4',
  roomy: 'px-8 py-5',
};

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  density?: Density;
  children?: ReactNode;
}

/** Column header: uppercase, tracked, muted. */
export function Th({ density = 'default', className, children, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        TH_DENSITY[density],
        'whitespace-nowrap text-left text-sm font-semibold uppercase tracking-wide text-table-header',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  density?: Density;
  /** Prevent wrapping (IDs, dates, status columns). */
  nowrap?: boolean;
  children?: ReactNode;
}

export function Td({ density = 'default', nowrap, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(TD_DENSITY[density], 'align-middle text-table-cell', nowrap && 'whitespace-nowrap', className)}
      {...rest}
    >
      {children}
    </td>
  );
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Hover affordance + pointer, for rows that navigate. */
  interactive?: boolean;
  children?: ReactNode;
}

export function Tr({ interactive, className, children, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        interactive && 'cursor-pointer transition-colors duration-fast ease-standard hover:bg-surface-alt',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}
