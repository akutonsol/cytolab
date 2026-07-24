// P5-6.4 — client types mirroring the FROZEN P5-6.1/6.2/6.3 API DTOs. Types only (no fetching) — the app's
// convention keeps hooks inline in components. These match the server contracts exactly; the review surface
// is metadata/QC/publication only (no storageKey, no pixel/delivery access).

export type GenerationStatus =
  | 'PROCESSING'
  | 'QC_PENDING'
  | 'QC_FAILED'
  | 'READY'
  | 'PUBLISHED'
  | 'SUPERSEDED'
  | 'ARCHIVED'
  | 'FAILED';

export type VerificationOutcome = 'PASSED' | 'FAILED';
export type PublicationAction = 'PUBLISHED' | 'SUPERSEDED';
export type PublicationIntegrity = 'OK' | 'DIVERGENT';
export type SlideAvailabilityStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface GenerationVerificationSummary {
  outcome: VerificationOutcome;
  verifiedAt: string;
  reasonCount: number;
}

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
  tileSourceType: string;
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
  publicationIntegrity: PublicationIntegrity;
  generations: GenerationReviewRow[];
  generationsTruncated: boolean;
}

export interface VerificationReason {
  code: string;
  detail: string;
}

export interface SlideAssetMeta {
  role: string;
  checksum: string | null;
  sizeBytes: number | null;
  purgedAt: string | null;
}

export interface VerificationRecord {
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
  tileSourceType: string;
  tiledWidth: number | null;
  tiledHeight: number | null;
  tileSize: number | null;
  levelCount: number | null;
  derivativeManifestChecksum: string | null;
  assets: SlideAssetMeta[];
  verifications: VerificationRecord[];
  verificationsTruncated: boolean;
  publicationEvents: GenerationPublicationRef[];
}

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
  nextCursor: string | null;
}

export type PublishResponse =
  | { outcome: 'PUBLISHED'; applied: true; generationId: string; publicationEventId: string; supersededGenerationId: string | null }
  | { outcome: 'ALREADY_PUBLISHED'; applied: false; generationId: string };

/** Only a READY generation is publishable (server-authoritative; this is a presentation hint). */
export const isPublishable = (status: GenerationStatus): boolean => status === 'READY';
