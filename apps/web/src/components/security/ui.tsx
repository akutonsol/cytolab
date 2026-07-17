'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge as UiBadge, Card as UiCard, IconAction, Th, Td, cn, compactButtonClass } from '@/components/ui';

/** Page shell used by every Security Center screen — consistent header + body. */
export function SecurityPage({
  title,
  subtitle,
  icon,
  actions,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  back?: string;
}) {
  const router = useRouter();
  return (
    <div className="w-full">
      <div className="mb-5 flex items-center gap-3">
        {back && (
          <IconAction icon={<ArrowLeft size={16} />} size="lg" hover={false} className="border border-slate-200 bg-white hover:text-slate-900" onClick={() => router.push(back)} aria-label="Back" />
        )}
        {icon && (
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'danger' | 'warning' | 'ok';
}) {
  // Tokens, not hex: #4F46E5 = --color-primary, #DC2626 = --status-danger-strong,
  // #16A34A = --status-success-strong.
  const toneColor = {
    default: 'var(--color-primary)',
    danger: 'var(--status-danger-strong)',
    warning: 'var(--color-warning)',
    ok: 'var(--status-success-strong)',
  }[tone];
  return (
    <UiCard radius="md" elevation="none" border="slate" padding="md">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ color: toneColor }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </UiCard>
  );
}

/**
 * Titled panel. Now the `Card` primitive with the Security Center's exact geometry
 * (rounded-2xl, slate-200 border, no shadow) — see DESIGN_SYSTEM §8n. The header row
 * and its hairline stay here: they are this module's composition, not a Card concern.
 */
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <UiCard radius="md" elevation="none" border="slate">
      {(title || actions) && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </UiCard>
  );
}

/**
 * Re-exported from the primitive. The local implementation is gone; `tone` replaces the
 * raw `bg`/`color` hex props its callers used to pass.
 */
export { UiBadge as Badge };

export function BoolPill({ on, onText = 'Yes', offText = 'No' }: { on: boolean; onText?: string; offText?: string }) {
  return on ? (
    <UiBadge size="sm" tone="success-strong">{onText}</UiBadge>
  ) : (
    <UiBadge size="sm" tone="muted">{offText}</UiBadge>
  );
}

/** A minimal, consistent table. Columns render a cell for each row. */
export function Table<T>({
  columns,
  rows,
  empty = 'Nothing to show.',
  rowKey,
  loading,
}: {
  columns: { key: string; header: string; render: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  empty?: string;
  rowKey: (row: T) => string;
  loading?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            {columns.map((c) => (
              <Th key={c.key} density="snug" nowrap={false} className={cn('text-xs', c.className)}>
                {c.header}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-10 text-center text-slate-500">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-10 text-center text-slate-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                {columns.map((c) => (
                  <Td key={c.key} density="snug" className={c.className}>
                    {c.render(row)}
                  </Td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Security Center's compact button shape. One definition now lives in
 * `ui/Button.tsx` (`compactButtonClass`); these are the same strings, not copies.
 */
export const dangerBtn = compactButtonClass('danger');
export const primaryBtn = compactButtonClass('primary');
export const ghostBtn = compactButtonClass('ghost');
