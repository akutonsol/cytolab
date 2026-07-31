import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdentityProviderService } from './identity-provider.service';
import { ServicePrincipalService } from './service-principal.service';
import { RegisterIdentityProviderDto, CreateServicePrincipalDto } from './dto/enterprise-auth.dto';

/**
 * Program 7 · Phase 7A.1 — enterprise-authentication administration API. Lab scope comes from the JWT principal (never
 * the body). Authorization: `identity:view` (read providers / service principals), `identity:manage` (register a
 * provider config, create/deactivate a service principal). NO route grants clinical, diagnostic, sign-out, or
 * AI-approval authority (ET5); there is no lifecycle/clinical/AI/diagnostic route. `identity` is granted to NO default
 * role (super-role only) — least privilege by default. Provider config is inert until an adapter ships (7A.2/7A.3).
 */
@ApiTags('enterprise-auth')
@ApiBearerAuth()
@Controller('enterprise-auth')
export class EnterpriseAuthController {
  constructor(
    private readonly providers: IdentityProviderService,
    private readonly servicePrincipals: ServicePrincipalService,
  ) {}

  @Get('providers')
  @RequirePermissions('identity:view')
  listProviders() {
    return this.providers.list();
  }

  @Post('providers')
  @RequirePermissions('identity:manage')
  registerProvider(@CurrentUser() user: AuthUser, @Body() dto: RegisterIdentityProviderDto) {
    return this.providers.register(dto, user.userId);
  }

  @Get('service-principals')
  @RequirePermissions('identity:view')
  listServicePrincipals() {
    return this.servicePrincipals.list();
  }

  @Post('service-principals')
  @RequirePermissions('identity:manage')
  createServicePrincipal(@CurrentUser() user: AuthUser, @Body() dto: CreateServicePrincipalDto) {
    return this.servicePrincipals.create(dto, user.userId);
  }

  @Post('service-principals/:id/deactivate')
  @RequirePermissions('identity:manage')
  deactivateServicePrincipal(@Param('id') id: string) {
    return this.servicePrincipals.deactivate(id);
  }
}
