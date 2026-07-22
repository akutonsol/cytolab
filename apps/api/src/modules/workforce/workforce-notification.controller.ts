import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { WorkforceNotificationService } from './workforce-notification.service';

// No @RequirePermissions: a user always sees and manages their OWN notifications
// (scoped by recipientId + tenancy). Authentication is enforced by the global
// JwtAuthGuard; FeatureGuard gates the feature flag (not authorization).
@ApiTags('workforce-notifications')
@ApiBearerAuth()
@RequireFeature('WORKFORCE_MANAGEMENT')
@UseGuards(FeatureGuard)
// Self-service on the caller's own notifications — authorization is the
// authenticated identity, not a role permission (R-001a).
@AuthorizationContract('authenticated')
@Controller()
export class WorkforceNotificationController {
  constructor(private notifications: WorkforceNotificationService) {}

  @Get('workforce/notifications')
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.userId);
  }

  @Get('workforce/notifications/unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.userId);
  }

  // Static 'read-all' declared before ':id/read'.
  @Patch('workforce/notifications/read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch('workforce/notifications/:id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user.userId);
  }
}
