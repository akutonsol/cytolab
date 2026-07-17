'use client';

import Link from 'next/link';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Badge, Card, IconAction } from '@/components/ui';
import { formatAge, SEVERITY_DOMAIN, type OperationsOverview } from './types';

/**
 * A1 — Attention Rail (docs/PATHOS_OPERATIONS_WORKSPACE.md §4 Group A).
 * The standing answer to "what needs a human now?". Ranked, de-duplicated, each
 * item one reason + one action. When empty it shows a TRUE steady state — a real
 * in-flight count, never a false zero. Renders only with loaded data (the page
 * owns the loading skeleton), so this component never lies while data is in flight.
 */
export function AttentionRail({
  attention,
  onOpen,
}: {
  attention: OperationsOverview['attention'];
  onOpen: (item: { id: string; caseRef: string }) => void;
}) {
  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-text">Needs attention</h2>
        <div className="flex items-center gap-3">
          {!attention.allClear && (
            <Badge domain="priority-high" size="sm">
              {attention.totalAtRisk} case{attention.totalAtRisk === 1 ? '' : 's'}
            </Badge>
          )}
          <Link
            href="/operations/sla-risk"
            className="text-sm font-semibold text-primary hover:underline"
          >
            SLA risk detail →
          </Link>
        </div>
      </div>

      {attention.allClear ? (
        <div className="flex items-center gap-3 rounded-xl bg-success-soft/60 px-4 py-5 text-success">
          <ShieldCheck size={22} aria-hidden />
          <div>
            <div className="text-sm font-semibold">All clear</div>
            <div className="text-sm text-text-secondary">
              {attention.inFlight} case{attention.inFlight === 1 ? '' : 's'} in flight, all within the
              turnaround target.
            </div>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col">
          {attention.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 border-t border-lightgray py-3 first:border-t-0"
            >
              <Badge domain={SEVERITY_DOMAIN[item.severity]} size="xs" dot className="shrink-0">
                {item.priority}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-text">{item.caseRef}</span>
                  <span className="shrink-0 text-text-tertiary">·</span>
                  <span className="min-w-0 truncate text-sm text-text-secondary">{item.stage}</span>
                </div>
                <div className="truncate text-sm text-text-secondary">
                  {item.reason}
                  {item.assignee ? ` · ${item.assignee}` : ' · unassigned'}
                  {/* On phones the age column is hidden (below), so surface it here inline. */}
                  <span className="text-text-tertiary sm:hidden"> · {formatAge(item.ageHours)}</span>
                </div>
              </div>
              <span className="hidden shrink-0 tabular-nums text-sm font-medium text-text-tertiary sm:block">
                {formatAge(item.ageHours)}
              </span>
              <IconAction
                icon={<ChevronRight size={16} />}
                tone="muted"
                className="shrink-0"
                aria-label={`Open ${item.caseRef}`}
                onClick={() => onOpen({ id: item.id, caseRef: item.caseRef })}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
