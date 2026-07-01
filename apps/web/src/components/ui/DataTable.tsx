'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';
import { Avatar } from './Avatar';

export interface Column<T> {
  key: string;
  title: ReactNode;
  render?: (row: T) => ReactNode;
  width?: string | number;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectChange?: (keys: string[]) => void;
  /** Row rendered with the primary-soft highlight + left accent. */
  activeKey?: string;
  /** Hover-revealed action area on the right (pencil + kebab). */
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function Check({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border transition-colors',
        checked ? 'border-primary bg-primary text-white' : 'border-border-strong bg-surface hover:border-primary/50',
      )}
      aria-checked={checked}
      role="checkbox"
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L4.7 8.4L9.5 3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/**
 * Airy list table: ~64px rows, hairline dividers, quiet header, optional leading
 * checkbox, active-row highlight, and a hover-revealed row-action area.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  selectable,
  selectedKeys = [],
  onSelectChange,
  activeKey,
  rowActions,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const selected = new Set(selectedKeys);
  const allChecked = data.length > 0 && data.every((r) => selected.has(rowKey(r)));
  const toggle = (k: string) => {
    const next = new Set(selected);
    next.has(k) ? next.delete(k) : next.add(k);
    onSelectChange?.(Array.from(next));
  };
  const toggleAll = () => onSelectChange?.(allChecked ? [] : data.map(rowKey));

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            {selectable && (
              <th className="w-10 py-3 pl-5 pr-2">
                <Check checked={allChecked} onChange={toggleAll} />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={cn(
                  'px-4 py-3 text-label font-medium text-text-secondary',
                  alignClass[c.align ?? 'left'],
                )}
              >
                {c.title}
              </th>
            ))}
            {rowActions && <th className="w-24 py-3 pr-5" />}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const k = rowKey(row);
            const isActive = k === activeKey;
            return (
              <tr
                key={k}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'group relative border-b border-border transition-colors',
                  onRowClick && 'cursor-pointer',
                  isActive ? 'bg-primary-soft' : 'hover:bg-[#f7f9fc]',
                )}
              >
                {selectable && (
                  <td className="relative py-4 pl-5 pr-2">
                    {isActive && <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-primary" />}
                    <Check checked={selected.has(k)} onChange={() => toggle(k)} />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-3.5 align-middle text-sm text-text',
                      alignClass[c.align ?? 'left'],
                    )}
                  >
                    {!selectable && ci === 0 && isActive && (
                      <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-primary" />
                    )}
                    {c.render ? c.render(row) : (row as Record<string, ReactNode>)[c.key]}
                  </td>
                ))}
                {rowActions && (
                  <td className="py-3.5 pr-5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {rowActions(row)}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Two-line primary cell: leading avatar + bold name over a gray sub-line. */
export function UserCell({ name, sub, src }: { name: string; sub?: ReactNode; src?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={src} size={40} />
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-text">{name}</span>
        {sub && <span className="text-meta text-text-tertiary">{sub}</span>}
      </div>
    </div>
  );
}

/** Status cell: a badge over a small gray date/meta line. */
export function StackedCell({ top, bottom }: { top: ReactNode; bottom?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {top}
      {bottom && <span className="text-meta text-text-tertiary">{bottom}</span>}
    </div>
  );
}
