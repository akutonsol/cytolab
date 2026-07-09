import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * The surface primitive. Replaces the 10 hand-written `const CARD = '…'` strings
 * that had drifted across 47 files.
 *
 * The variant axes exist to absorb that legacy drift **pixel-for-pixel** — they
 * are not an invitation to invent new combinations. New screens should take the
 * defaults (`radius="md" elevation="soft" border="hairline"`), which is the
 * dominant shape (16 files). The long tail is expected to converge onto it.
 *
 * Every value resolves through a token: no raw hex, no raw shadow, no raw radius.
 */
type Radius = 'sm' | 'md' | 'lg';
type Elevation = 'none' | 'sm' | 'soft' | 'raised';
type Border = 'hairline' | 'subtle' | 'warm' | 'none';
type Padding = 'none' | 'sm' | 'md' | 'lg';

const RADIUS: Record<Radius, string> = {
  sm: 'rounded-xl', // 12px
  md: 'rounded-2xl', // 16px
  lg: 'rounded-panel', // 20px — var(--radius-panel)
};

const ELEVATION: Record<Elevation, string> = {
  none: '',
  sm: 'shadow-sm',
  soft: 'shadow-card-soft', // 0 2px 12px rgba(0,0,0,.03)
  raised: 'shadow-card-raised', // 0 4px 24px rgba(0,0,0,.04)
};

const BORDER: Record<Border, string> = {
  // The de-facto card border across the app (#eef2f7). NOTE: this is *not*
  // --color-border-card (#e5e3dc, warm) — the token and the reality diverged
  // long ago. Documented in DESIGN_SYSTEM §1f; not unified here (visible recolour).
  hairline: 'border border-lightgray',
  subtle: 'border border-slate-100',
  warm: 'border border-card',
  none: '',
};

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-8',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  radius?: Radius;
  elevation?: Elevation;
  border?: Border;
  padding?: Padding;
  /** Lift the card on hover. Uses --motion-hover; no-ops under reduced motion. */
  interactive?: boolean;
  children?: ReactNode;
}

export function Card({
  radius = 'md',
  elevation = 'soft',
  border = 'hairline',
  padding = 'none',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface',
        RADIUS[radius],
        ELEVATION[elevation],
        BORDER[border],
        PADDING[padding],
        interactive &&
          'cursor-pointer transition-shadow duration-fast ease-standard hover:shadow-card-hover',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
