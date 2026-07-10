'use client';

import type { ReactNode } from 'react';

/**
 * Page transition.
 *
 * Next re-mounts `template.tsx` on every navigation (unlike `layout.tsx`), so this is the
 * one place the "page enters" gesture belongs. It is CSS, not framer-motion: the
 * authenticated product ships zero `<motion.*>` components and a route transition is not
 * worth a runtime animation library.
 *
 * Deliberately *not* an exit animation. Exiting would delay the next screen's paint, and
 * Sprint 8 spent an entire sprint making the product feel like it never waits. Motion
 * explains state; it must never become the state.
 *
 * The 8px rise reads as "this arrived", not as "this bounced". Under
 * `prefers-reduced-motion` it collapses to 1ms via the global backstop in globals.css.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="helix-page">{children}</div>;
}
