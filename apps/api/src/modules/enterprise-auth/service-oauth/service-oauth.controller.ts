import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ClientCredentialsService } from './client-credentials.service';
import { ServicePrincipalCredentialService } from './service-principal-credential.service';
import { ServicePrincipalScopeService } from './service-principal-scope.service';
import { ClientCredentialsTokenDto, AssignScopeDto } from './dto/service-oauth.dto';

/**
 * Program 7 · Phase 7A.2b — Service-Principal OAuth API.
 *  • Token endpoint (`@Public`, throttled): OAuth 2.0 Client Credentials grant — machine authentication, no session.
 *  • Admin routes (`identity:view` / `identity:manage`, staff): credential issue/rotate/revoke + Permission-catalogue
 *    scope assignment. NO clinical/AI/diagnostic route; the plaintext secret is returned ONCE on issuance and never
 *    echoed again. Machine identity is immutable — no rename/reuse/hard-delete of a service principal.
 */
@ApiTags('enterprise-auth-service-oauth')
@Controller('enterprise-auth')
export class ServiceOAuthController {
  constructor(
    private readonly clientCredentials: ClientCredentialsService,
    private readonly credentials: ServicePrincipalCredentialService,
    private readonly scopes: ServicePrincipalScopeService,
  ) {}

  // ── Token endpoint (machine authentication) ───────────────────────────────────────────────────────────────────
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('oauth/token')
  token(@Body() dto: ClientCredentialsTokenDto) {
    return this.clientCredentials.grant(dto.client_id, dto.client_secret);
  }

  // ── Credential lifecycle (staff admin) ────────────────────────────────────────────────────────────────────────
  @Post('service-principals/:id/credentials')
  @RequirePermissions('identity:manage')
  issueCredential(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.credentials.issue(id, user.userId); // returns { credentialId, secret } — secret shown ONCE
  }

  @Post('service-principals/credentials/:credentialId/revoke')
  @RequirePermissions('identity:manage')
  revokeCredential(@Param('credentialId') credentialId: string) {
    return this.credentials.revoke(credentialId);
  }

  // ── Scope management (Permission catalogue; staff admin) ──────────────────────────────────────────────────────
  @Get('service-principals/:id/scopes')
  @RequirePermissions('identity:view')
  listScopes(@Param('id') id: string) {
    return this.scopes.list(id);
  }

  @Post('service-principals/:id/scopes')
  @RequirePermissions('identity:manage')
  assignScope(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignScopeDto) {
    return this.scopes.assign(id, dto.permissionCode, user.userId);
  }

  @Delete('service-principals/scopes/:scopeId')
  @RequirePermissions('identity:manage')
  revokeScope(@Param('scopeId') scopeId: string) {
    return this.scopes.revokeScope(scopeId);
  }
}
