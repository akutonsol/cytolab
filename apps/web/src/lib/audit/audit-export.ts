/**
 * Program 2 · P2-9B — pure helpers + types for the governed Audit Log export workflow. Transport lives
 * in AuditQueryClient (the single frozen boundary); this module holds only browser-safe, testable
 * helpers: response-error classification (status only, never raw backend content), Content-Disposition
 * filename parsing + sanitization, a deterministic fallback filename, and the browser download trigger.
 *
 * GOVERNANCE MIRROR: the backend records the governed LOGICAL export; the frontend cannot verify that
 * the browser saved or opened the file, so success copy says "prepared / download started" — never
 * "delivered / received / saved". Truncation is read from the server header, never counted client-side.
 */

export type AuditExportFormat = 'csv' | 'ndjson';
export type AuditExportProjection = 'base' | 'phi';

export interface AuditExportRequest {
  format: AuditExportFormat;
  projection: AuditExportProjection;
}

export interface AuditExportResult {
  blob: Blob;
  filename: string;
  truncated: boolean;
  contentType: string;
}

export type AuditExportErrorKind = 'forbidden' | 'invalid' | 'concealed' | 'failed';

/** Classify a transport failure by HTTP status ONLY. The error body (a Blob for this endpoint) is
 *  never read — no raw backend content, stack, chain/registry detail, or R-016 wording is surfaced. */
export function classifyAuditExportError(err: unknown): AuditExportErrorKind {
  const status = (err as { response?: { status?: number } } | null | undefined)?.response?.status;
  if (status === 403) return 'forbidden';
  if (status === 400) return 'invalid';
  if (status === 404) return 'concealed';
  return 'failed'; // 5xx, network, timeout, and R-016-affected SYSTEM failures all read the same
}

/** User-facing copy per failure kind. Generic by design — a 403 never says which scope/permission
 *  failed; a 5xx/network/R-016 failure never mentions chains, sequences, capture, or the database. */
export const AUDIT_EXPORT_ERROR_COPY: Record<AuditExportErrorKind, string> = {
  forbidden: 'You don’t have permission to export this audit data.',
  invalid: 'The export settings are no longer valid. Review them and try again.',
  concealed: 'This audit export isn’t available.',
  failed: 'The audit export could not be prepared. No file was produced.',
};

export const AUDIT_EXPORT_SUCCESS_COPY = 'Export prepared — your download has started.';
export const AUDIT_EXPORT_TRUNCATED_COPY =
  'Your export reached the maximum size and may not include every matching audit event.';

/** Extract a filename hint from a Content-Disposition header (RFC 5987 `filename*` wins). May be null. */
export function parseContentDispositionFilename(header?: string | null): string | null {
  if (!header || typeof header !== 'string') return null;
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to plain */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || null;
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** The deterministic, non-sensitive fallback filename (no predicate/lab/patient content). */
export function exportFilenameFallback(req: AuditExportRequest): string {
  return `audit-export-${req.projection}.${req.format === 'csv' ? 'csv' : 'ndjson'}`;
}

/**
 * Treat the server filename as a HINT: accept only a bare, safe name that matches the requested format
 * extension; otherwise use the deterministic fallback. Path separators, control chars, quotes, and any
 * unexpected character force the fallback — a server (or proxy) can never steer the download path/name.
 */
export function safeExportFilename(candidate: string | null, req: AuditExportRequest): string {
  const ext = req.format === 'csv' ? 'csv' : 'ndjson';
  const fallback = exportFilenameFallback(req);
  if (!candidate) return fallback;
  // Any path separator is treated as tampering — distrust the whole name, never salvage a basename.
  if (/[\\/]/.test(candidate)) return fallback;
  if (candidate.length > 128) return fallback;
  if (!SAFE_NAME.test(candidate)) return fallback; // only [A-Za-z0-9._-]
  if (!candidate.toLowerCase().endsWith(`.${ext}`)) return fallback; // must match the requested format
  return candidate;
}

/**
 * Start a browser download from the successful export artifact. Creates a short-lived object URL,
 * clicks a hidden anchor, then revokes the URL on the next tick (so the download can latch onto it
 * first). The blob is not retained anywhere after this call returns.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
