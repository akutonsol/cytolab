import { Module } from '@nestjs/common';
import { EnterpriseAuthController } from './enterprise-auth.controller';
import { AuthenticationService } from './authentication.service';
import { LocalAuthenticationAdapter } from './local-authentication.adapter';
import { AUTHENTICATION_ADAPTERS } from './enterprise-auth-tokens';
import { IdentityProviderService } from './identity-provider.service';
import { ServicePrincipalService } from './service-principal.service';
import { FederatedIdentityService } from './federated-identity.service';

/**
 * Program 7 · Phase 7A.1 — Enterprise Authentication foundation. ADDITIVE and non-invasive: it establishes the
 * canonical-principal + provider-isolation seam alongside the existing auth stack, which remains authoritative
 * (Principle 8). PrismaService comes from its @Global module. The single Local adapter is registered behind the
 * `AUTHENTICATION_ADAPTERS` seam; SAML/OIDC/OAuth adapters are added here in 7A.2/7A.3 with zero downstream change.
 * Identity is a platform service (Principle 9): this module owns authentication; other modules consume the principal.
 */
@Module({
  controllers: [EnterpriseAuthController],
  providers: [
    LocalAuthenticationAdapter,
    { provide: AUTHENTICATION_ADAPTERS, useFactory: (local: LocalAuthenticationAdapter) => [local], inject: [LocalAuthenticationAdapter] },
    AuthenticationService,
    IdentityProviderService,
    ServicePrincipalService,
    FederatedIdentityService,
  ],
  exports: [AuthenticationService, IdentityProviderService, ServicePrincipalService, FederatedIdentityService],
})
export class EnterpriseAuthModule {}
