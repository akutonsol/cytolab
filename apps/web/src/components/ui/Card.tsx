import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
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
type Elevation = 'none' | 'sm' | 'soft' | 'raised' | 'glow';
type Border = 'hairline' | 'subtle' | 'gray' | 'faint' | 'warm' | 'none';
type Padding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

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
  glow: 'shadow-card-glow', // raised + a faint indigo lift (patient hero)
};

const BORDER: Record<Border, string> = {
  // The de-facto card border across the app (#eef2f7). NOTE: this is *not*
  // --color-border-card (#e5e3dc, warm) — the token and the reality diverged
  // long ago. Documented in DESIGN_SYSTEM §1f; not unified here (visible recolour).
  hairline: 'border border-lightgray',
  subtle: 'border border-slate-100',
  // `gray` and `faint` exist only to absorb two legacy files pixel-identically
  // (portal/reports uses gray-200, analytics gray-100). Do not reach for them in
  // new code; they are convergence debt, not choices.
  gray: 'border border-gray-200',
  faint: 'border border-gray-100',
  warm: 'border border-card',
  none: '',
};

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-4',  // 16px
  md: 'p-5',  // 20px
  lg: 'p-6',  // 24px
  xl: 'p-8',  // 32px
};

export interface CardStyle {
  radius?: Radius;
  elevation?: Elevation;
  border?: Border;
  padding?: Padding;
  surface?: boolean;
}

/**
 * The card class string, for surfaces that cannot be a `<Card>` element — chiefly
 * `next/link`, which owns its own `href` typing. Use this instead of copying the
 * classes: it keeps one source of truth.
 *
 *   <Link href={…} className={cn(cardClass({ elevation: 'soft' }), 'flex gap-3 p-5')}>
 */
export function cardClass({
  radius = 'md',
  elevation = 'soft',
  border = 'hairline',
  padding = 'none',
  surface = true,
}: CardStyle = {}) {
  return cn(surface && 'bg-surface', RADIUS[radius], ELEVATION[elevation], BORDER[border], PADDING[padding]);
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /**
   * The rendered element. Cards are frequently also the click target (a category
   * tile, a report row), and wrapping a <button> in a <div> would break semantics
   * and keyboard focus. `as="button"` keeps the surface and the affordance as one node.
   */
  as?: 'div' | 'section' | 'article' | 'button';
  /** Forwarded when `as="button"`. Defaults to "button" so a Card never submits a form. */
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  disabled?: boolean;
  radius?: Radius;
  elevation?: Elevation;
  border?: Border;
  padding?: Padding;
  /**
   * Paint the card background. `false` leaves it transparent — the patient hero
   * card relies on the gradient behind it showing through.
   */
  surface?: boolean;
  /** Lift the card on hover. Uses --motion-hover; no-ops under reduced motion. */
  interactive?: boolean;
  children?: ReactNode;
}

export function Card({
  as: Comp = 'div',
  type,
  radius = 'md',
  elevation = 'soft',
  border = 'hairline',
  padding = 'none',
  surface = true,
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  const buttonProps = Comp === 'button' ? { type: type ?? ('button' as const) } : {};
  return (
    <Comp
      className={cn(
        cardClass({ radius, elevation, border, padding, surface }),
        interactive &&
          'cursor-pointer transition-shadow duration-fast ease-standard hover:shadow-card-hover',
        className,
      )}
      {...buttonProps}
      {...rest}
    >
      {children}
    </Comp>
  );
}
