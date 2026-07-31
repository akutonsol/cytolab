import { IdentityProviderProtocol } from '@prisma/client';
import { CanonicalPrincipal } from './canonical-principal';

/**
 * Program 7 · Phase 7A.1 — the AUTHENTICATION ADAPTER seam (Provider-Isolation invariant). An adapter is the ONLY
 * place that knows a provider's protocol/assertion/token details; its sole output is a `CanonicalPrincipal`. Adding a
 * new identity provider means adding an adapter — with zero change to clinical, AI, or authorization code.
 */
export type AuthenticationProtocol = 'LOCAL' | IdentityProviderProtocol;

export interface AuthenticationResult {
  readonly principal: CanonicalPrincipal;
  readonly providerKey: string;
  readonly protocol: AuthenticationProtocol;
}

export interface AuthenticationAdapter {
  /** lab-agnostic provider handle (e.g. "local"); unique among registered adapters. */
  readonly providerKey: string;
  /** the protocol this adapter speaks — provider-specific knowledge terminates here. */
  readonly protocol: AuthenticationProtocol;
  /** verify provider input and resolve it to a canonical principal, or null if it cannot be established. */
  authenticate(input: unknown): Promise<AuthenticationResult | null>;
}
