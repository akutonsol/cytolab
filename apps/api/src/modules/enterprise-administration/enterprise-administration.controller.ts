import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { EnterpriseAdministrationService } from './enterprise-administration.service';

// Thin orchestration controller for the Enterprise Administration & Controls Workspace.
// One read-only endpoint. The base gate is `record:view` (plan §3); each section resolves its
// own owner permission inside the descriptive map. Owner endpoints remain the enforcement authority.
@Controller('enterprise-administration')
export class EnterpriseAdministrationController {
  constructor(private readonly service: EnterpriseAdministrationService) {}

  @Get('overview')
  @RequirePermissions('record:view')
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user);
  }
}
