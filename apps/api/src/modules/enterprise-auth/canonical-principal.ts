/**
 * Program 7 · Phase 7A.1 — the CANONICAL PRINCIPAL: the single, provider-agnostic representation of an authenticated
 * identity. Every authentication front-end (Local now; SAML/OIDC/OAuth via 7A.2/7A.3) terminates at an authentication
 * adapter whose only output is a `CanonicalPrincipal` (the Provider-Isolation invariant). Downstream code depends on
 * this type ONLY — never on a provider type, assertion, or token.
 *
 * `principalId` is the STABLE internal identifier (GG7): for a human it is the immutable `User.id`; for a service it is
 * the immutable `ServicePrincipal.id`. It never changes as external attributes (email / subject / display name) change.
 * A non-human principal is a structurally distinct class (Principle 11) and never carries clinical/AI authority.
 */
export type PrincipalKind = 'HUMAN' | 'SERVICE';

export interface CanonicalPrincipal {
  readonly kind: PrincipalKind;
  readonly principalId: string; // stable internal identifier (GG7)
  readonly labId: string;
}

export const humanPrincipal = (userId: string, labId: string): CanonicalPrincipal => ({ kind: 'HUMAN', principalId: userId, labId });
export const servicePrincipal = (servicePrincipalId: string, labId: string): CanonicalPrincipal => ({ kind: 'SERVICE', principalId: servicePrincipalId, labId });

export const isHuman = (p: CanonicalPrincipal): boolean => p.kind === 'HUMAN';
export const isService = (p: CanonicalPrincipal): boolean => p.kind === 'SERVICE';
/** A non-human principal never holds clinical/diagnostic/sign-out/AI-approval authority (Principle 11 / ET6). */
export const mayHoldClinicalAuthority = (p: CanonicalPrincipal): boolean => p.kind === 'HUMAN';
