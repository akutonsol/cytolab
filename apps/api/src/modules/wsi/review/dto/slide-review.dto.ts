import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  GenerationStatus,
  PublicationAction,
  SlideAssetRole,
  SlideAvailabilityStatus,
  TileSourceType,
  VerificationOutcome,
} from '@prisma/client';

/**
 * Program 5B · P5-6.1 — response contracts for the read-only Clinical Review surface. These are PLAIN
 * projections of the FROZEN slide/generation/verification/publication model — no invented lifecycle state,
 * no mutation, no delivery capability. All timestamps are ISO-8601 strings; `null` means "not yet".
 *
 * Frozen-boundary note: asset metadata deliberately OMITS `storageKey` (delivery-internal) so this surface
 * creates NO unpublished-pixel retrieval path — pixels stay behind the published-generation-only delivery
 * boundary (P5-6b, separate). Publication history uses keyset pagination; generation/verification lists are
 * bounded caps that report truncation rather than silently dropping rows.
 */

// Bounded caps / pagination (D-E). Generation + verification lists are capped and report truncation;
// publication history (the true growth surface) is keyset-paginated.
export const GENERATION_LIST_CAP = 100;
export const VERIFICATION_HISTORY_CAP = 100;
export const PUBLICATION_PAGE_DEFAULT = 50;
export const PUBLICATION_PAGE_MAX = 200;

export type PublicationIntegrity = 'OK' | 'DIVERGENT';

export interface VerificationReason {
  code: string;
  detail: string;
}

export interface GenerationVerificationSummary {
  outcome: VerificationOutcome;
  verifiedAt: string;
  reasonCount: number;
}

// ── R1: GET /wsi/slides/:slideId/review ──────────────────────────────────────
export interface GenerationReviewRow {
  generationId: string;
  status: GenerationStatus;
  sealed: boolean;
  verified: boolean;
  sealedAt: string | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  tileSourceType: TileSourceType;
  tiledWidth: number | null;
  tiledHeight: number | null;
  levelCount: number | null;
  isCurrentPublished: boolean;
  latestVerification: GenerationVerificationSummary | null;
}

export interface SlideReviewSummary {
  slideId: string;
  availabilityStatus: SlideAvailabilityStatus | null;
  currentPublishedGenerationId: string | null;
  publishedAt: string | null;
  /** Observed integrity of the slide→published-generation pointer. Reported, never thrown (D-D). */
  publicationIntegrity: PublicationIntegrity;
  generations: GenerationReviewRow[];
  /** True when more generations exist than the returned cap (D-E — never a silent drop). */
  generationsTruncated: boolean;
}

// ── R2: GET /wsi/slides/:slideId/generations/:generationId/evidence ───────────
export interface SlideAssetMeta {
  role: SlideAssetRole;
  checksum: string | null;
  sizeBytes: number | null;
  purgedAt: string | null;
  // storageKey intentionally excluded (delivery-internal; D-F).
}

export interface VerificationRecordDto {
  verificationId: string;
  outcome: VerificationOutcome;
  reasons: VerificationReason[];
  manifestChecksum: string;
  verifierVersion: string;
  verifiedAt: string;
}

export interface GenerationPublicationRef {
  publicationEventId: string;
  action: PublicationAction;
  actorUserId: string | null;
  at: string;
}

// P5-8 — the source half of the generation lineage: ingestion → processing job → (this) generation.
// Completes the ingestion→job→generation→asset chain. Read-only; storage-internal keys excluded.
export interface SlideIngestionRef {
  id: string;
  sourceKind: string;
  status: string;
  sourceChecksum: string | null;
  originalFilename: string | null;
  sizeBytes: number | null;
  createdAt: string;
  // sourceObjectKey intentionally excluded (private storage key — storage/delivery-internal).
}
export interface SlideProcessingJobRef {
  id: string;
  status: string;
  attempt: number;
  workerId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
  // errorDetail intentionally excluded (may embed internal paths); errorCode is a stable code.
}
export interface GenerationSourceLineage {
  job: SlideProcessingJobRef | null;
  ingestion: SlideIngestionRef | null;
}

export interface GenerationEvidence {
  generationId: string;
  slideId: string;
  status: GenerationStatus;
  sealed: boolean;
  verified: boolean;
  sealedAt: string | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  tileSourceType: TileSourceType;
  tiledWidth: number | null;
  tiledHeight: number | null;
  tileSize: number | null;
  levelCount: number | null;
  derivativeManifestChecksum: string | null;
  assets: SlideAssetMeta[];
  verifications: VerificationRecordDto[];
  verificationsTruncated: boolean;
  publicationEvents: GenerationPublicationRef[];
  /** P5-8 — the ingestion→job source half of the lineage (completes ingestion→job→generation→asset). */
  source: GenerationSourceLineage;
}

// ── R3: GET /wsi/slides/:slideId/publications ────────────────────────────────
export interface PublicationEvent {
  publicationEventId: string;
  at: string;
  publishedGenerationId: string;
  supersededGenerationId: string | null;
  actorUserId: string | null;
}

export interface SlidePublicationHistory {
  slideId: string;
  currentPublishedGenerationId: string | null;
  events: PublicationEvent[];
  /** Opaque keyset cursor for the next (older) page; null when exhausted. */
  nextCursor: string | null;
}

export class PublicationHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PUBLICATION_PAGE_MAX)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
