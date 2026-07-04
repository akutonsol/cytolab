'use client';

// Client portal shell. The root app/layout.tsx already provides <html>/<body>
// and the QueryClientProvider, so this is a lightweight nested layout: a clean
// white canvas with none of the staff app's hero nav or density.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-on-surface">{children}</div>;
}
