/**
 * Program 2 · P2-7A — audit-query authorization & scope-resolution policy (pure; no persistence).
 *
 * Scope and PHI are INDEPENDENT dimensions. The resolver never trusts a caller-supplied organization;
 * it derives the LAB from the authenticated principal and validates any SYSTEM/CROSS_LAB selection
 * against AUDIT_SYSTEM_READ. A superuser (isSuperRole) satisfies every gate, mirroring PermissionsGuard.
 */
import { ForbiddenException } from '@nestjs/common';
import { AUDIT_READ, AUDIT_SYSTEM_READ, AUDIT_PHI_READ } from './audit-query.permissions';
import { AuditReaderPrincipal, RequestedAuditScope, ResolvedAuditScope } from './audit-query.types';

const has = (p: AuditReaderPrincipal, code: string): boolean =>
  p.isSuperRole === true || p.permissions.includes(code);

/** Maximum labs a CROSS_LAB request may name (bounds the fan-out). */
export const MAX_CROSS_LAB_IDS = 25;

export function isSystemReader(p: AuditReaderPrincipal): boolean {
  return has(p, AUDIT_SYSTEM_READ);
}

/**
 * P2-7B locked model: EVERY audit-query reader requires audit:read (a superuser satisfies it via
 * bypass). SYSTEM/PHI are additive on top. Throws otherwise. (Corrects the P2-7A resolver, which
 * treated a lone audit:read_system as sufficient base access — see the P2-7B deliverable §29.)
 */
export function assertBaseAuditRead(p: AuditReaderPrincipal): void {
  if (!has(p, AUDIT_READ)) throw new ForbiddenException('Missing permission: audit:read');
}

/**
 * Detail visibility for a by-id read: a LAB reader sees only their own lab's LAB rows; a SYSTEM
 * reader sees everything they are authorized for (no scope restriction). Base audit:read required.
 */
export function resolveAuditDetailVisibility(
  p: AuditReaderPrincipal,
): { kind: 'ALL' } | ResolvedAuditScope {
  assertBaseAuditRead(p);
  if (isSystemReader(p)) return { kind: 'ALL' };
  if (!p.labId) throw new ForbiddenException('No lab context for a lab-scoped audit read');
  return { kind: 'LAB', labId: p.labId };
}

/**
 * Resolve the authorized query scope. LAB readers are pinned to their own lab; SYSTEM readers may
 * select SYSTEM, a single lab, or a bounded CROSS_LAB set, and default (unspecified) to SYSTEM —
 * never inheriting broad lab visibility merely from holding a labId.
 */
export function resolveAuditQueryScope(
  principal: AuditReaderPrincipal,
  requested: RequestedAuditScope = {},
): ResolvedAuditScope {
  assertBaseAuditRead(principal); // locked model: every reader needs audit:read
  const systemReader = isSystemReader(principal);

  const wantsSystemOrCross = requested.scope === 'SYSTEM' || requested.scope === 'CROSS_LAB';
  if (wantsSystemOrCross && !systemReader) {
    throw new ForbiddenException('SYSTEM/CROSS_LAB audit scope requires audit:read_system');
  }

  if (!systemReader) {
    // LAB reader — pinned to the authenticated lab; may not select another lab.
    if (!principal.labId) throw new ForbiddenException('No lab context for a lab-scoped audit read');
    if (requested.labIds && requested.labIds.some((id) => id !== principal.labId)) {
      throw new ForbiddenException('A lab-scoped reader may not select another lab');
    }
    return { kind: 'LAB', labId: principal.labId };
  }

  // SYSTEM reader.
  switch (requested.scope) {
    case 'SYSTEM':
    case undefined: // well-defined default for a SYSTEM reader = platform (SYSTEM/CROSS_LAB) events
      return { kind: 'SYSTEM' };
    case 'LAB': {
      const ids = requested.labIds ?? [];
      if (ids.length !== 1) throw new ForbiddenException('LAB scope requires exactly one labId');
      return { kind: 'LAB', labId: ids[0] };
    }
    case 'CROSS_LAB': {
      const ids = requested.labIds ?? [];
      if (ids.length < 1) throw new ForbiddenException('CROSS_LAB scope requires at least one labId');
      if (ids.length > MAX_CROSS_LAB_IDS) {
        throw new ForbiddenException(`CROSS_LAB scope is limited to ${MAX_CROSS_LAB_IDS} labs`);
      }
      return { kind: 'CROSS_LAB', labIds: [...ids] };
    }
  }
}

/**
 * Resolve whether the PHI projection is permitted. PHI is additive and independent of scope: SYSTEM
 * access alone never grants it. Requesting PHI without AUDIT_PHI_READ is a hard denial.
 */
export function resolveAuditPhiAccess(principal: AuditReaderPrincipal, requestedPhi: boolean): boolean {
  if (!requestedPhi) return false;
  if (!has(principal, AUDIT_PHI_READ)) {
    throw new ForbiddenException('PHI audit projection requires audit:read_phi');
  }
  return true;
}
