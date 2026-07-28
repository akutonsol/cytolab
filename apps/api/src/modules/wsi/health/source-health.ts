import type { IngestionAdapterType, SourceHealthState } from '@prisma/client';

/**
 * Program 5C · C5 — the import-connection HEALTH contract. This is the health of the accepted import
 * connection / transport / adapter-config / intake path — NEVER scanner hardware. Checkers assess reachability;
 * they NEVER trigger discovery/ingestion/reconciliation/processing and never persist raw errors/URLs/credentials.
 */

/** Structured, non-secret health error codes. Never a raw exception message / URL / credential / path. */
export type HealthCheckErrorCode =
  | 'HEALTH_CHECK_TIMEOUT'
  | 'FILESYSTEM_NOT_FOUND'
  | 'FILESYSTEM_PERMISSION_DENIED'
  | 'FILESYSTEM_UNREADABLE'
  | 'DICOMWEB_HOST_REJECTED'
  | 'DICOMWEB_UNREACHABLE'
  | 'DICOMWEB_AUTH_REJECTED'
  | 'DICOMWEB_INVALID_RESPONSE'
  | 'ADAPTER_NOT_REGISTERED'
  | 'ADAPTER_TRANSPORT_MISMATCH'
  | 'SOURCE_MISCONFIGURED'
  | 'CHECK_INTERNAL_ERROR';

export interface SourceHealthResult {
  state: SourceHealthState;
  errorCode?: HealthCheckErrorCode;
  responseTimeMs?: number;
}

/** The persisted source fields a checker needs (credentialCipher is decrypted in-process by the checker only). */
export interface ResolvedIngestionSource {
  id: string;
  kind: string; // FILESYSTEM | DICOMWEB
  rootPath: string | null;
  endpointBaseUrl: string | null;
  authType: string | null;
  credentialCipher: string | null;
  adapterType: IngestionAdapterType | null;
  enabled: boolean;
}

/** A transport-specific reachability checker. Selected by `supports`; NEVER mutates or triggers intake. */
export interface IngestionSourceHealthChecker {
  supports(source: ResolvedIngestionSource): boolean;
  check(source: ResolvedIngestionSource): Promise<SourceHealthResult>;
}

/** DI token collecting the statically-registered transport checkers (no dynamic loading). */
export const SOURCE_HEALTH_CHECKERS = Symbol('SOURCE_HEALTH_CHECKERS');

/** State precedence (a stronger negative wins): DISABLED > MISCONFIGURED/AUTH_REJECTED/UNREACHABLE > DEGRADED > HEALTHY > UNKNOWN. */
export const HEALTH_STATE_RANK: Record<SourceHealthState, number> = {
  DISABLED: 6,
  MISCONFIGURED: 5,
  AUTH_REJECTED: 5,
  UNREACHABLE: 5,
  DEGRADED: 3,
  HEALTHY: 2,
  UNKNOWN: 1,
};
