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
type Density = 'compact' | 'cozy' | 'default' | 'roomy';
/** Header type size. The app ships two: an 11px micro-label and a 14px label. */
type ThSize = 'xs' | 'sm';
/**
 * Two typography families coexist in this codebase:
 *   `slate`     — text-sm / tracking-wide / --color-table-header (9 tables)
 *   `reference` — font-label-sm / tracking-wider / text-secondary (3 tables)
 * Neither is canonical yet; choosing one is a design decision, not a migration.
 * The axis exists so both adopt the primitive pixel-identically. See DESIGN_SYSTEM §8i.
 */
type Family = 'slate' | 'reference';
/**
 * Cell text colour. `cell` is --color-table-cell (slate-700); `inherit` leaves the
 * colour to the row, which the workforce tables rely on. Not a style choice —
 * convergence debt, documented in DESIGN_SYSTEM §8d.
 */
type TdTone = 'cell' | 'inherit';

const TH_DENSITY: Record<Density, string> = {
  compact: 'px-4 py-3',
  cozy: 'px-4 py-4',
  default: 'px-6 py-4',
  roomy: 'px-8 py-4',
};

const TD_DENSITY: Record<Density, string> = {
  compact: 'px-4 py-3',
  cozy: 'px-4 py-4',
  default: 'px-6 py-4',
  roomy: 'px-8 py-5',
};

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  density?: Density;
  size?: ThSize;
  family?: Family;
  children?: ReactNode;
}

const TH_SIZE: Record<ThSize, string> = { xs: 'text-[11px]', sm: 'text-sm' };

const TH_FAMILY: Record<Family, string> = {
  slate: 'font-semibold tracking-wide text-table-header',
  reference: 'font-label-sm text-label-sm tracking-wider text-secondary',
};

const TD_FAMILY: Record<Family, string> = {
  slate: 'text-table-cell',
  reference: 'font-body-sm text-body-sm text-on-surface',
};

/** Column header: uppercase, tracked, muted. */
export function Th({ density = 'default', size = 'sm', family = 'slate', className, children, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        TH_DENSITY[density],
        // the reference family sets its own size via font-label-sm/text-label-sm
        family === 'slate' && TH_SIZE[size],
        'whitespace-nowrap text-left uppercase',
        TH_FAMILY[family],
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
  tone?: TdTone;
  family?: Family;
  /** Prevent wrapping (IDs, dates, status columns). */
  nowrap?: boolean;
  children?: ReactNode;
}

export function Td({ density = 'default', tone = 'cell', family = 'slate', nowrap, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        TD_DENSITY[density],
        'align-middle',
        tone === 'cell' && TD_FAMILY[family],
        nowrap && 'whitespace-nowrap',
        className,
      )}
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
