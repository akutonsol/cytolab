/**
 * Program 2 · P2-7A — the authoritative audit-query READ boundary (INTERFACE only; no concrete
 * Prisma-backed implementation until P2-7B review). It lives inside the Audit module and is the ONLY
 * sanctioned reader of stored audit events for external consumers: callers receive domain views, never
 * the Prisma model, and the interface exposes NO mutation (no update/delete/repair/rehash/verify).
 * Scope + PHI enforcement happen INSIDE the implementation, independently of any controller.
 */
import { AuditReaderPrincipal, RequestedAuditScope, AuditEventView, AuditEventPhiView, AuditEventPage } from './audit-query.types';
import { RawAuditQueryFilters } from './audit-query.filters';

export interface AuditQueryListInput {
  principal: AuditReaderPrincipal;
  requestedScope?: RequestedAuditScope;
  filters?: RawAuditQueryFilters;
  cursor?: string | null;
  /** Opt-in PHI projection; requires audit:read_phi (enforced by the implementation). */
  phi?: boolean;
}

export interface AuditQueryGetInput {
  principal: AuditReaderPrincipal;
  id: string;
  phi?: boolean;
}

/**
 * READ-ONLY audit-query port. P2-7B provides the Prisma-backed AuditQueryService; P2-7A defines the
 * contract shape only. There is intentionally NO write method on this interface.
 */
export interface AuditQueryPort {
  list(input: AuditQueryListInput): Promise<AuditEventPage<AuditEventView | AuditEventPhiView>>;
  /**
   * Fetch one event under the SAME scope + PHI policy as list(). Returns null when the event does not
   * exist OR is outside the caller's authorized scope — the two are indistinguishable to the caller,
   * so an inaccessible event is never revealed.
   */
  getById(input: AuditQueryGetInput): Promise<AuditEventView | AuditEventPhiView | null>;
}
