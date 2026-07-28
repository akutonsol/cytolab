/**
 * Program 5C · C3 — structured DICOMweb error taxonomy. TRANSPORT/SECURITY errors are kept distinct from
 * CLINICAL/CONFORMANCE outcomes (which the accepted C1/C2 path owns). No error message may carry a credential,
 * a full URL with PHI query params, or raw response bodies — callers redact before surfacing.
 */
export type DicomWebErrorCode =
  | 'ENDPOINT_UNREACHABLE'
  | 'AUTH_REJECTED' // 401
  | 'FORBIDDEN' // 403
  | 'TIMEOUT'
  | 'REDIRECT_REJECTED'
  | 'HOST_NOT_ALLOWED' // SSRF: not HTTPS / not allowlisted / resolves to a private address
  | 'INVALID_QIDO_RESPONSE'
  | 'MALFORMED_MULTIPART'
  | 'SERIES_NOT_FOUND'
  | 'RESPONSE_TOO_LARGE';

/** A DICOMweb transport/security failure. Never a clinical/conformance verdict (that stays UNSUPPORTED/etc.). */
export class DicomWebError extends Error {
  constructor(
    public readonly code: DicomWebErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DicomWebError';
  }
}
