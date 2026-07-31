import { Inject, Injectable } from '@nestjs/common';
import { AUTHENTICATION_ADAPTERS } from './enterprise-auth-tokens';
import { AuthenticationAdapter, AuthenticationResult } from './authentication-adapter';

/**
 * Program 7 · Phase 7A.1 — the single principal-establishment boundary. It routes an authentication request to the
 * registered adapter for a provider and returns the resulting `CanonicalPrincipal`. This is the one place providers
 * plug in (Provider-Isolation invariant); everything downstream consumes only the canonical principal. Deterministic
 * (Principle 12): a given (providerKey, input) always routes to the same adapter and yields the same result.
 */
@Injectable()
export class AuthenticationService {
  private readonly byKey: Map<string, AuthenticationAdapter>;

  constructor(@Inject(AUTHENTICATION_ADAPTERS) adapters: AuthenticationAdapter[]) {
    this.byKey = new Map(adapters.map((a) => [a.providerKey, a]));
  }

  registeredProviders(): string[] {
    return [...this.byKey.keys()].sort();
  }

  /** Establish a canonical principal via the named provider's adapter, or null if the provider is unknown/unresolved. */
  async authenticate(providerKey: string, input: unknown): Promise<AuthenticationResult | null> {
    const adapter = this.byKey.get(providerKey);
    if (!adapter) return null;
    return adapter.authenticate(input);
  }
}
