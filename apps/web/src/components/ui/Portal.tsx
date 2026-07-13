'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into <body>, escaping any ancestor that establishes a
 * containing block for `position: fixed` — a transform/filter/perspective/
 * will-change on a wrapper (e.g. a theme page-entrance animation) otherwise
 * re-anchors `fixed` overlays to that wrapper and pushes them off-screen.
 *
 * App-level modals/overlays should wrap their `fixed inset-0` root in <Portal>
 * so no future wrapper transform can mis-position them. SSR-safe: renders
 * nothing until mounted on the client (createPortal needs a real DOM node).
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
