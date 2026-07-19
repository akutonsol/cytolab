/**
 * Program 2 · P2-8B — audit read capabilities, derived ONLY from the authenticated principal's
 * permissions (superuser bypass via the shared `can`). Capabilities gate AFFORDANCES (which controls
 * render); they never grant access — the API remains the single enforcement point.
 */
import { useAuth } from '../auth';

export const AUDIT_READ = 'audit:read';
export const AUDIT_SYSTEM_READ = 'audit:read_system';
export const AUDIT_PHI_READ = 'audit:read_phi';

export interface AuditCapabilities {
  canRead: boolean; // base list access (own lab)
  canSystem: boolean; // SYSTEM / CROSS_LAB / explicit lab selection
  canPhi: boolean; // PHI projection
}

/** Pure derivation, exported for testing. `can` mirrors the API guard (superuser bypasses all). */
export function deriveAuditCapabilities(can: (code?: string) => boolean): AuditCapabilities {
  return { canRead: can(AUDIT_READ), canSystem: can(AUDIT_SYSTEM_READ), canPhi: can(AUDIT_PHI_READ) };
}

export function useAuditCapabilities(): AuditCapabilities {
  const { can } = useAuth();
  return deriveAuditCapabilities(can);
}
