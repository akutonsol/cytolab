import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Glassmorphic dashboard card (ported from the v0 template). Renders a centred
 * title with an optional right-aligned action, over the v0 indigo card surface.
 * Color tokens resolve from the scoped `.dashboard-theme` wrapper (globals.css).
 */
export function GlassCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'relative flex flex-col rounded-3xl border border-white/80 bg-[var(--card)] p-5 shadow-[0_12px_40px_-12px_rgba(80,70,160,0.25)] md:p-6',
        className,
      )}
    >
      <header className="relative flex items-start justify-center gap-3">
        <div className="space-y-0.5 text-center">
          <h2 className="text-base font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
          {description ? <p className="text-xs text-[var(--muted-foreground)]">{description}</p> : null}
        </div>
        {action ? <div className="absolute right-0 top-0">{action}</div> : null}
      </header>
      <div className="mt-5 flex-1">{children}</div>
    </section>
  );
}
