import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { QualityGovernanceService } from './quality-governance.service';

@ApiTags('quality-governance')
@ApiBearerAuth()
@Controller('quality-governance')
export class QualityGovernanceController {
  constructor(private readonly quality: QualityGovernanceService) {}

  /**
   * Read-only Quality & Governance overview aggregate. Orchestration only: composes no
   * owner data yet (C2). Returns the descriptive permission map (ready) and the ten
   * evidence sections as `deferred`. Guarded by the workspace entry permission
   * `record:view`; owner endpoints remain the enforcement authority for each section.
   */
  @Get('overview')
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Composed read-only overview aggregate for the Quality & Governance Workspace' })
  overview(@CurrentUser() user: AuthUser) {
    return this.quality.overview(user);
  }
}
