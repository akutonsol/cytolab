import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SignoutService } from './signout.service';

@ApiTags('signout')
@ApiBearerAuth()
@Controller('signout')
export class SignoutController {
  constructor(private readonly signout: SignoutService) {}

  /**
   * Read-only Sign-Out aggregate for one case. Orchestration only: composes existing
   * services around recordId, no new persistence. B2 hydrates case, patient, clinical
   * context, and the effective permission map; other sections return deferred.
   */
  @Get('case/:recordId')
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Composed read-only case aggregate for the Sign-Out Workspace' })
  caseAggregate(@Param('recordId') recordId: string, @CurrentUser() user: AuthUser) {
    return this.signout.caseAggregate(recordId, user);
  }
}
