import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/**
 * Page-level layout wrapper: vertical rhythm + horizontal gutter + optional
 * max-width. The product app is full-bleed by default (the app shell already
 * constrains width), so `width="full"` is the default; `width="prose"` and
 * `"narrow"` exist for settings/detail columns that should not run edge to edge.
 *
 * Spacing comes from the Tailwind scale, which is the 4px grid Sprint 2 fixed.
 */
type Width = 'full' | 'wide' | 'prose' | 'narrow';
type Gap = 'sm' | 'md' | 'lg';

const WIDTH: Record<Width, string> = {
  full: '',
  wide: 'mx-auto max-w-[90rem]',
  prose: 'mx-auto max-w-[60rem]',
  narrow: 'mx-auto max-w-[40rem]',
};

const GAP: Record<Gap, string> = {
  sm: 'space-y-4',
  md: 'space-y-6',
  lg: 'space-y-8',
};

export interface SectionContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: Width;
  /** Vertical rhythm between direct children. */
  gap?: Gap;
  children?: ReactNode;
}

export function SectionContainer({
  width = 'full',
  gap = 'md',
  className,
  children,
  ...rest
}: SectionContainerProps) {
  return (
    <div className={cn('min-h-full py-6', WIDTH[width], GAP[gap], className)} {...rest}>
      {children}
    </div>
  );
}
