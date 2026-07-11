import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto, UpdateNotificationPreferencesDto } from './dto/notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notification:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: NotificationQueryDto) {
    return this.notifications.findAll(user.userId, query);
  }

  @Get('unread-count')
  @RequirePermissions('notification:view')
  @ApiOperation({ summary: 'Unread notification count (bell badge)' })
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.getUnreadCount(user.userId);
  }

  @Get('preferences')
  @RequirePermissions('notification:view')
  @ApiOperation({ summary: 'Get the current user’s notification delivery preferences' })
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.userId);
  }

  @Put('preferences')
  @RequirePermissions('notification:change')
  @ApiOperation({ summary: 'Update the current user’s notification delivery preferences' })
  updatePreferences(@CurrentUser() user: AuthUser, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updatePreferences(user.userId, dto);
  }

  @Put('read-all')
  @RequirePermissions('notification:change')
  @ApiOperation({ summary: 'Mark all of the current user’s notifications read' })
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Put(':id/read')
  @RequirePermissions('notification:change')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(id, user.userId);
  }
}
