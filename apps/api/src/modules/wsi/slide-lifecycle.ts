import { Prisma, GenerationStatus } from '@prisma/client';

/**
 * P5-5 — truthful slide lifecycle derivation.
 *
 * Viewability is AUTHORITATIVE, never inferred from `availabilityStatus`, `format`, `slideUrl`, the mere
 * existence of metadata, a `READY` generation, or an ingestion. A slide is viewable ONLY when
 * `publishedGenerationId` is set — which, by the publication contract + the partial unique index
 * (one PUBLISHED, sealed+verified generation per slide), means a genuinely published generation exists.
 *
 * The five states are mutually exclusive with this precedence:
 *   PUBLISHED  (published generation → viewable)
 *   PROCESSING (a generation is PROCESSING or QC_PENDING)
 *   READY      (a sealed+verified READY generation, NOT yet published → NOT viewable)
 *   QC_FAILED  (all generations failed QC)
 *   DRAFT      (no generation yet)
 */
export type SlideLifecycleState = 'DRAFT' | 'PROCESSING' | 'READY' | 'QC_FAILED' | 'PUBLISHED';

export interface SlideLifecycle {
  state: SlideLifecycleState;
  /** True ONLY for PUBLISHED — a READY-but-unpublished slide is never viewable. */
  viewable: boolean;
}

export interface LifecycleGeneration {
  status: string;
  sealed: boolean;
  verified: boolean;
}

export function deriveSlideLifecycle(input: { publishedGenerationId: string | null; generations: LifecycleGeneration[] }): SlideLifecycle {
  if (input.publishedGenerationId) return { state: 'PUBLISHED', viewable: true };
  const g = input.generations;
  if (g.some((x) => x.status === 'PROCESSING' || x.status === 'QC_PENDING')) return { state: 'PROCESSING', viewable: false };
  if (g.some((x) => x.status === 'READY' && x.sealed && x.verified)) return { state: 'READY', viewable: false };
  if (g.length > 0 && g.every((x) => x.status === 'QC_FAILED')) return { state: 'QC_FAILED', viewable: false };
  return { state: 'DRAFT', viewable: false };
}

/**
 * Prisma `where` fragment selecting slides in a given lifecycle state — kept in lock-step with
 * {@link deriveSlideLifecycle} so a `status` filter returns exactly the rows the derivation would label.
 * (Combined with tenant scoping applied automatically by the tenancy extension.)
 */
export function lifecycleWhere(state: SlideLifecycleState): Prisma.DigitalSlideWhereInput {
  const inProgress = { status: { in: ['PROCESSING', 'QC_PENDING'] as GenerationStatus[] } };
  switch (state) {
    case 'PUBLISHED':
      return { publishedGenerationId: { not: null } };
    case 'PROCESSING':
      return { publishedGenerationId: null, generations: { some: inProgress } };
    case 'READY':
      return {
        publishedGenerationId: null,
        AND: [
          { generations: { some: { status: 'READY', sealed: true, verified: true } } },
          { generations: { none: inProgress } },
        ],
      };
    case 'QC_FAILED':
      return {
        publishedGenerationId: null,
        generations: { some: { status: 'QC_FAILED' }, none: { status: { in: ['PROCESSING', 'QC_PENDING', 'READY', 'PUBLISHED', 'SUPERSEDED'] as GenerationStatus[] } } },
      };
    case 'DRAFT':
      return { publishedGenerationId: null, generations: { none: {} } };
  }
}
