'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge as UiBadge } from '@/components/ui';

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
    <div className="mx-auto w-full max-w-[1200px]">
      <div className="mb-5 flex items-center gap-3">
        {back && (
          <button
            onClick={() => router.push(back)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
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
  const toneColor = {
    default: '#4F46E5',
    danger: '#DC2626',
    warning: 'var(--color-warning)',
    ok: '#16A34A',
  }[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-bold" style={{ color: toneColor }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      {(title || actions) && (
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

/**
 * Thin wrapper over the `Badge` primitive, kept only because this module's callers
 * pass raw `bg`/`color` values. The geometry now has a single definition in
 * `ui/Badge` (`size="sm"` reproduces the previous px-2.5 py-0.5 text-xs exactly).
 *
 * TODO: migrate the callers to `tone` / `domain` and delete this shim — the raw
 * hex props are the last thing keeping it alive.
 */
export function Badge({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return (
    <UiBadge size="sm" style={{ background: bg, color }}>
      {children}
    </UiBadge>
  );
}

export function BoolPill({ on, onText = 'Yes', offText = 'No' }: { on: boolean; onText?: string; offText?: string }) {
  return on ? (
    <Badge bg="#F0FDF4" color="#16A34A">{onText}</Badge>
  ) : (
    <Badge bg="#F1F5F9" color="#475569">{offText}</Badge>
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
              <th key={c.key} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${c.className ?? ''}`}>
                {c.header}
              </th>
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
                  <td key={c.key} className={`px-5 py-3 align-middle text-slate-700 ${c.className ?? ''}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export const dangerBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50';
export const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700';
export const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50';
