import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnterpriseAuthController } from './enterprise-auth.controller';
import { AuthenticationService } from './authentication.service';
import { LocalAuthenticationAdapter } from './local-authentication.adapter';
import { AUTHENTICATION_ADAPTERS } from './enterprise-auth-tokens';
import { IdentityProviderService } from './identity-provider.service';
import { ServicePrincipalService } from './service-principal.service';
import { FederatedIdentityService } from './federated-identity.service';
import { OidcController } from './oidc/oidc.controller';
import { OidcService } from './oidc/oidc.service';
import { OidcTransactionService } from './oidc/oidc-transaction.service';
import { OidcTokenValidator } from './oidc/oidc-token-validator';
import { OidcAuthenticationAdapter } from './oidc/oidc-authentication.adapter';
import { OIDC_DISCOVERY_CLIENT, HttpOidcDiscoveryClient } from './oidc/oidc-discovery';

/**
 * Program 7 · Phase 7A — Enterprise Authentication. 7A.1 established the canonical-principal + provider-isolation seam
 * (Local adapter); 7A.2a adds the OIDC adapter behind the SAME seam — zero downstream change — plus the interactive
 * OIDC login orchestration (transaction + config-immutability, discovery/JWKS/claim validation) and reuses the existing
 * session path via AuthModule's AuthService (no parallel session). ADDITIVE and non-invasive; the live local login is
 * authoritative. Identity is a platform service (Principle 9): this module owns authentication; others consume it.
 */
@Module({
  imports: [AuthModule],
  controllers: [EnterpriseAuthController, OidcController],
  providers: [
    LocalAuthenticationAdapter,
    OidcAuthenticationAdapter,
    { provide: AUTHENTICATION_ADAPTERS, useFactory: (local: LocalAuthenticationAdapter, oidc: OidcAuthenticationAdapter) => [local, oidc], inject: [LocalAuthenticationAdapter, OidcAuthenticationAdapter] },
    AuthenticationService,
    IdentityProviderService,
    ServicePrincipalService,
    FederatedIdentityService,
    OidcService,
    OidcTransactionService,
    OidcTokenValidator,
    { provide: OIDC_DISCOVERY_CLIENT, useClass: HttpOidcDiscoveryClient },
  ],
  exports: [AuthenticationService, IdentityProviderService, ServicePrincipalService, FederatedIdentityService, OidcService],
})
export class EnterpriseAuthModule {}
