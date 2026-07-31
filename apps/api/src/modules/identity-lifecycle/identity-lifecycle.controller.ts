import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { IdentityLifecycleService } from './identity-lifecycle.service';
import { LifecycleActionDto } from './dto/identity-lifecycle.dto';

/**
 * Program 7 · Phase 7B.1 — governed identity-lifecycle administration. Lab-scoped (labId comes from the JWT context,
 * never the body). Every route requires the additive `identitylifecycle:manage` permission and terminates at the existing
 * PermissionsGuard — it grants no roles/permissions and confers no clinical/AI authority (L11/L12). All transitions go
 * through the single lifecycle command boundary (L8). The acting human is attributed from the token.
 */
@ApiTags('identity-lifecycle')
@Controller('identity-lifecycle')
export class IdentityLifecycleController {
  constructor(private readonly lifecycle: IdentityLifecycleService) {}

  @Post('users/:userId/suspend')
  @RequirePermissions('identitylifecycle:manage')
  suspend(@Param('userId') userId: string, @Body() dto: LifecycleActionDto, @CurrentUser() actor: AuthUser) {
    return this.lifecycle.suspend(userId, { reason: dto.reason, actorUserId: actor.userId });
  }

  @Post('users/:userId/reactivate')
  @RequirePermissions('identitylifecycle:manage')
  reactivate(@Param('userId') userId: string, @Body() dto: LifecycleActionDto, @CurrentUser() actor: AuthUser) {
    return this.lifecycle.reactivate(userId, { reason: dto.reason, actorUserId: actor.userId });
  }

  @Post('users/:userId/deprovision')
  @RequirePermissions('identitylifecycle:manage')
  deprovision(@Param('userId') userId: string, @Body() dto: LifecycleActionDto, @CurrentUser() actor: AuthUser) {
    return this.lifecycle.deprovision(userId, { reason: dto.reason, actorUserId: actor.userId });
  }
}
