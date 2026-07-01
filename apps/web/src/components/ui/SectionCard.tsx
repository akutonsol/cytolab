import type { ReactNode } from 'react';
import { cn } from './cn';

interface SectionCardProps {
  title?: ReactNode;
  /** Small line under the title. */
  subtitle?: ReactNode;
  /** Right-aligned control(s) in the header — PillSelect, expand button, etc. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (e.g. when embedding a full-bleed table). */
  flush?: boolean;
}

/** Generic titled card: header row (title + right-aligned control) over a body. */
export function SectionCard({ title, subtitle, action, children, className, bodyClassName, flush }: SectionCardProps) {
  return (
    <section className={cn('flex flex-col rounded-card border border-border bg-surface shadow-card', className)}>
      {(title || action) && (
        <header className={cn('flex items-start justify-between gap-4 px-6 pt-5', flush ? 'pb-4' : 'pb-1')}>
          <div className="flex flex-col gap-0.5">
            {title && <h2 className="text-lg font-semibold leading-tight text-text">{title}</h2>}
            {subtitle && <span className="text-meta text-text-tertiary">{subtitle}</span>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-6 pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}
