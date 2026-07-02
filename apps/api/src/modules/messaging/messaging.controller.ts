import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateThreadDto, SendMessageDto, ThreadQueryDto, UserQueryDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('messaging')
@ApiBearerAuth()
@Controller()
export class MessagingController {
  constructor(private messaging: MessagingService) {}

  // Static sub-routes before :id-style routes to avoid conflicts.
  @Get('messaging/users')
  @RequirePermissions('message:view')
  users(@Query() query: UserQueryDto) {
    return this.messaging.listUsers(query);
  }

  @Get('messaging/threads')
  @RequirePermissions('message:view')
  listThreads(@CurrentUser() user: AuthUser, @Query() query: ThreadQueryDto) {
    return this.messaging.listThreads(user.userId, query);
  }

  @Get('messaging/threads/:id')
  @RequirePermissions('message:view')
  getThread(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.messaging.getThread(user.userId, id);
  }

  @Post('messaging/threads')
  @RequirePermissions('message:view')
  createThread(@CurrentUser() user: AuthUser, @Body() dto: CreateThreadDto) {
    return this.messaging.createThread(user.userId, dto);
  }

  @Post('messaging/threads/:id/messages')
  @RequirePermissions('message:send')
  sendMessage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.messaging.sendMessage(user.userId, id, dto);
  }
}
