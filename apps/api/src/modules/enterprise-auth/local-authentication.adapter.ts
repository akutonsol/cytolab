import { Injectable } from '@nestjs/common';
import { AuthenticationAdapter, AuthenticationResult } from './authentication-adapter';
import { humanPrincipal } from './canonical-principal';

/**
 * Program 7 · Phase 7A.1 — the LOCAL authentication adapter. It represents the platform's existing local-password
 * authentication as one provider behind the seam. It does NOT reimplement or rewire password verification — the live
 * login path (AuthService/SessionService) remains authoritative and untouched (Principle 8; ET1/ET8); the adapter maps
 * an already-verified human user to the canonical principal. Its output is a `CanonicalPrincipal` whose stable
 * identifier is the immutable `User.id` (GG7). Federated adapters (7A.2/7A.3) will perform full assertion/token
 * verification behind the same seam.
 */
export interface LocalAuthenticationInput {
  userId: string; // an already-verified human principal (verified by the existing login path)
  labId: string;
}

@Injectable()
export class LocalAuthenticationAdapter implements AuthenticationAdapter {
  readonly providerKey = 'local';
  readonly protocol = 'LOCAL' as const;

  async authenticate(input: unknown): Promise<AuthenticationResult | null> {
    const candidate = input as Partial<LocalAuthenticationInput> | null | undefined;
    if (!candidate || typeof candidate.userId !== 'string' || typeof candidate.labId !== 'string' || !candidate.userId || !candidate.labId) {
      return null;
    }
    return { principal: humanPrincipal(candidate.userId, candidate.labId), providerKey: this.providerKey, protocol: this.protocol };
  }
}
