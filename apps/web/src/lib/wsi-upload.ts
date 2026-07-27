// P5-4 Phase B Part 1 — browser client for the existing WSI chunked-ingestion pipeline.
//
// This drives the REAL backend ingestion contract (initiate → chunk → complete) and NEVER creates a slide
// via the legacy paste-URL path. It NEVER publishes and NEVER implies viewability: publication remains the
// deliberate wsi:publish action on the P5-2R review surface, and "viewable" is derived only from actual
// persisted published-generation truth (a non-null currentPublishedGenerationId).

import { api } from './api';

/** Bytes per chunk. Well under the API's 64 MB per-chunk ceiling. */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

export interface InitiateResult {
  slideId: string;
  ingestionId: string;
}
export interface IngestionRow {
  id: string;
  slideId: string;
  status: 'UPLOADING' | 'UPLOADED' | 'VERIFIED' | 'FAILED' | string;
  sizeBytes: number | null;
  originalFilename: string | null;
}
export interface ReviewState {
  generations: { generationId: string; status: string }[];
  currentPublishedGenerationId: string | null;
}

/** sha256 (lowercase hex) of the whole file, via WebCrypto. */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function initiateUpload(recordId: string, meta: { filename?: string; sizeBytes?: number; specimenId?: string }): Promise<InitiateResult> {
  const { data } = await api.post(`/wsi/records/${recordId}/slide-uploads`, meta);
  return { slideId: data.slideId, ingestionId: data.ingestionId };
}

/** Upload the file body in ordered chunks. `onProgress` receives fraction 0..1 of bytes sent. */
export async function uploadChunks(ingestionId: string, body: ArrayBuffer, onProgress?: (fraction: number) => void): Promise<void> {
  const total = body.byteLength;
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, total);
    const chunk = body.slice(offset, end);
    // Raw octet-stream body; the API reads the request stream and writes at ?offset.
    const { data } = await api.post(`/wsi/slide-ingestions/${ingestionId}/chunks`, chunk, {
      params: { offset },
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    offset = typeof data?.nextOffset === 'number' ? data.nextOffset : end;
    onProgress?.(Math.min(1, offset / total));
  }
}

export async function completeUpload(ingestionId: string, expectedChecksum: string): Promise<IngestionRow> {
  const { data } = await api.post(`/wsi/slide-ingestions/${ingestionId}/complete`, { expectedChecksum });
  return data.ingestion as IngestionRow;
}

export async function getIngestion(ingestionId: string): Promise<IngestionRow> {
  const { data } = await api.get(`/wsi/slide-ingestions/${ingestionId}`);
  return data as IngestionRow;
}

/** Review state (only reachable with wsi:review). Returns null if the caller is not permitted / not ready. */
export async function getReview(slideId: string): Promise<ReviewState | null> {
  try {
    const { data } = await api.get(`/wsi/slides/${slideId}/review`);
    return { generations: data.generations ?? [], currentPublishedGenerationId: data.currentPublishedGenerationId ?? null };
  } catch {
    return null;
  }
}

export type LifecyclePhase = 'idle' | 'uploading' | 'verifying' | 'tracking';
export interface LifecycleInput {
  phase: LifecyclePhase;
  ingestionStatus?: string;
  /** From the review surface; null when the caller lacks wsi:review or no generation exists yet. */
  review?: ReviewState | null;
  canReview: boolean;
}
export interface Lifecycle {
  key: 'uploading' | 'verifying' | 'processing' | 'ready_unpublished' | 'qc_failed' | 'published' | 'failed';
  label: string;
  /** True ONLY when a published generation actually exists — never inferred from upload/READY. */
  viewable: boolean;
  tone: 'progress' | 'wait' | 'error' | 'ok';
}

/**
 * Map real backend state → a truthful lifecycle label. Invariants:
 *  - `viewable` is true ONLY when review reports a non-null currentPublishedGenerationId (persisted publish truth).
 *  - upload completion (VERIFIED) and a READY generation are NEVER reported as viewable.
 *  - without wsi:review the caller sees the honest merged "processing — awaiting review & publication".
 */
export function deriveLifecycle(i: LifecycleInput): Lifecycle {
  if (i.phase === 'uploading') return { key: 'uploading', label: 'Uploading…', viewable: false, tone: 'progress' };
  if (i.phase === 'verifying') return { key: 'verifying', label: 'Verifying upload…', viewable: false, tone: 'progress' };
  if (i.ingestionStatus === 'FAILED') return { key: 'failed', label: 'Upload failed — checksum mismatch', viewable: false, tone: 'error' };

  const r = i.review;
  if (r && r.currentPublishedGenerationId) return { key: 'published', label: 'Published — viewable', viewable: true, tone: 'ok' };
  if (i.canReview && r) {
    const statuses = new Set(r.generations.map((g) => g.status));
    if (statuses.has('READY')) return { key: 'ready_unpublished', label: 'Ready — awaiting authorized publication', viewable: false, tone: 'wait' };
    if (statuses.size > 0 && !statuses.has('PROCESSING') && !statuses.has('QC_PENDING') && statuses.has('QC_FAILED')) {
      return { key: 'qc_failed', label: 'Failed quality control — not publishable', viewable: false, tone: 'error' };
    }
  }
  return { key: 'processing', label: 'Processing — awaiting review & publication', viewable: false, tone: 'wait' };
}
