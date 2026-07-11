'use client';

import { Badge, Card } from '@/components/ui';
import { formatAge, type OperationsOverview, type PipelineStage } from './types';

/**
 * B1 — Pipeline Board (docs/PATHOS_OPERATIONS_WORKSPACE.md §4 Group B).
 * The whole lab as a pipeline of lifecycle stages, each with count, oldest-case
 * age, and SLA risk. Stages are the real six in-flight RecordStatus values grouped
 * by the existing Intake → Processing → Review lifecycle — no fabricated sub-queues.
 */
const GROUP_ORDER = ['Intake', 'Processing', 'Review'];

export function PipelineBoard({ pipeline }: { pipeline: OperationsOverview['pipeline'] }) {
  const groups = GROUP_ORDER.map((name) => ({
    name,
    stages: pipeline.stages.filter((s) => s.group === name),
  })).filter((g) => g.stages.length > 0);

  return (
    <Card radius="md" elevation="soft" border="hairline" padding="lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-text">Case pipeline</h2>
        <span className="text-sm text-text-secondary">
          <span className="font-semibold tabular-nums text-text">{pipeline.totalInFlight}</span> in
          flight
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {groups.map((group) => (
          <div key={group.name}>
            <div className="mb-2 text-label font-semibold uppercase tracking-wide text-text-tertiary">
              {group.name}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {group.stages.map((stage) => (
                <StageCard key={stage.status} stage={stage} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StageCard({ stage }: { stage: PipelineStage }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-lightgray bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <Badge domain={stage.domain} size="xs">
          {stage.label}
        </Badge>
        {stage.atRisk > 0 && (
          <Badge domain="priority-high" size="xs">
            {stage.atRisk} at risk
          </Badge>
        )}
      </div>
      <span className="text-stat font-extrabold tabular-nums text-text">{stage.count}</span>
      <span className="text-meta text-text-tertiary">
        {stage.count > 0 ? `oldest ${formatAge(stage.oldestAgeHours)}` : 'none waiting'}
      </span>
    </div>
  );
}
