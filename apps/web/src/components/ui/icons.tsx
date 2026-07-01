import type { SVGProps } from 'react';

/** Diagonal up-right arrow used on the pastel corner buttons and expand controls. */
export function ArrowUpRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M5 11L11 5M11 5H5.5M11 5V10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Plus(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 16 16" fill="none" aria-hidden {...props}>
      <path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
