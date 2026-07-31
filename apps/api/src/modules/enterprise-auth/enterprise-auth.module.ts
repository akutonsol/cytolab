import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
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
import { OidcJwksResolver } from './oidc/oidc-jwks-resolver';
import { OIDC_DISCOVERY_CLIENT, HttpOidcDiscoveryClient } from './oidc/oidc-discovery';
import { ServiceOAuthController } from './service-oauth/service-oauth.controller';
import { ServiceTokenSigner } from './service-oauth/service-token.signer';
import { ServicePrincipalCredentialService } from './service-oauth/service-principal-credential.service';
import { ServicePrincipalScopeService } from './service-oauth/service-principal-scope.service';
import { ClientCredentialsService } from './service-oauth/client-credentials.service';
import { ServiceJwtStrategy } from './service-oauth/service-jwt.strategy';

/**
 * Program 7 · Phase 7A — Enterprise Authentication. 7A.1 established the canonical-principal + provider-isolation seam
 * (Local adapter); 7A.2a added interactive OIDC behind the same seam; 7A.2b adds Service-Principal OAuth (machine
 * client-credentials) — a distinct non-human principal class with its own signing seam, strategy, and guard, whose
 * scopes are the existing Permission catalogue enforced by the existing PermissionsGuard (D5). ADDITIVE and
 * non-invasive; the human login path is unchanged and authoritative. Identity is a platform service (Principle 9).
 */
@Module({
  imports: [AuthModule, PassportModule, JwtModule.register({})],
  controllers: [EnterpriseAuthController, OidcController, ServiceOAuthController],
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
    OidcJwksResolver,
    { provide: OIDC_DISCOVERY_CLIENT, useClass: HttpOidcDiscoveryClient },
    // 7A.2b — Service-Principal OAuth (machine authentication)
    ServiceTokenSigner,
    ServicePrincipalCredentialService,
    ServicePrincipalScopeService,
    ClientCredentialsService,
    ServiceJwtStrategy, // registers the 'jwt-service' passport strategy; the guard is a global APP_GUARD in AuthModule
  ],
  exports: [AuthenticationService, IdentityProviderService, ServicePrincipalService, FederatedIdentityService, OidcService, ServicePrincipalCredentialService, ServicePrincipalScopeService, ClientCredentialsService, ServiceTokenSigner],
})
export class EnterpriseAuthModule {}
