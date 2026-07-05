import { Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WorkforceNotificationService } from './workforce-notification.service';

// No @RequirePermissions: a user always sees and manages their OWN notifications
// (scoped by recipientId + tenancy). Authentication is enforced by the global
// JwtAuthGuard.
@ApiTags('workforce-notifications')
@ApiBearerAuth()
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
