import { Injectable } from '@nestjs/common';
import { AuthenticationAdapter, AuthenticationResult } from '../authentication-adapter';
import { FederatedIdentityService } from '../federated-identity.service';

/**
 * Program 7 · Phase 7A.3 — the SAML authentication adapter (behind the accepted 7A.1 provider-isolation seam). Given an
 * ALREADY-VALIDATED assertion subject (the `SamlAssertionValidator` performed all signature/XSW/semantic validation —
 * S8), it resolves the opaque `NameID` to a canonical HUMAN principal via the accepted 7A.1 linkage. It performs NO
 * auto-provisioning and NO email/attribute matching (§3b) — an unlinked subject yields `null` (fail closed; provisioning
 * is 7B / D5). Its only output is a `CanonicalPrincipal`; no assertion/XML/certificate/provider detail leaks downstream.
 */
export interface SamlAuthenticationInput {
  identityProviderId: string;
  nameId: string; // opaque external subject — the durable link is (identityProviderId, NameID) → User.id (GG7)
}

@Injectable()
export class SamlAuthenticationAdapter implements AuthenticationAdapter {
  readonly providerKey = 'saml';
  readonly protocol = 'SAML' as const;

  constructor(private readonly federated: FederatedIdentityService) {}

  async authenticate(input: unknown): Promise<AuthenticationResult | null> {
    const candidate = input as Partial<SamlAuthenticationInput> | null | undefined;
    if (!candidate || typeof candidate.identityProviderId !== 'string' || typeof candidate.nameId !== 'string' || !candidate.identityProviderId || !candidate.nameId) {
      return null;
    }
    // Resolve the opaque NameID to a canonical HUMAN principal via the accepted 7A.1 linkage. No JIT/provisioning (§3b).
    const principal = await this.federated.resolve(candidate.identityProviderId, candidate.nameId);
    if (!principal) return null; // unlinked subject → fail closed
    return { principal, providerKey: this.providerKey, protocol: this.protocol };
  }
}
