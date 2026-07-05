import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SupportService } from './support.service';
import {
  AssignTicketDto,
  CreateAnnouncementDto,
  CreateCommentDto,
  CreateMaintenanceWindowDto,
  CreateTicketDto,
  PublicCreateTicketDto,
  ResolveTicketDto,
  TicketQueryDto,
  UpdateAnnouncementDto,
  UpdateMaintenanceWindowDto,
  UpdateTicketDto,
} from './dto/support.dto';

@ApiTags('support')
@ApiBearerAuth()
@Controller('system/support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ─── Tickets ──────────────────────────────────────────────────────────────

  @Post('tickets')
  @RequirePermissions('system:health')
  createTicket(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user, dto);
  }

  // Public client/consultant submission — no JWT. Rate-limited to 5/IP/hour.
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('tickets/public')
  createPublicTicket(@Body() dto: PublicCreateTicketDto) {
    return this.support.createPublicTicket(dto);
  }

  @Get('tickets')
  @RequirePermissions('system:health')
  listTickets(@CurrentUser() user: AuthUser, @Query() query: TicketQueryDto) {
    return this.support.listTickets(user, query);
  }

  @Get('stats')
  @RequirePermissions('system:health')
  stats(@CurrentUser() user: AuthUser) {
    return this.support.stats(user);
  }

  @Get('tickets/:id')
  @RequirePermissions('system:health')
  getTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.getTicket(user, id);
  }

  @Patch('tickets/:id')
  @RequirePermissions('system:health')
  updateTicket(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.support.updateTicket(user, id, dto);
  }

  @Patch('tickets/:id/assign')
  @RequirePermissions('system:health')
  assignTicket(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTicketDto) {
    return this.support.assignTicket(user, id, dto);
  }

  @Patch('tickets/:id/resolve')
  @RequirePermissions('system:health')
  resolveTicket(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveTicketDto) {
    return this.support.resolveTicket(user, id, dto);
  }

  @Patch('tickets/:id/close')
  @RequirePermissions('system:health')
  closeTicket(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.closeTicket(user, id);
  }

  @Post('tickets/:id/comments')
  @RequirePermissions('system:health')
  addComment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateCommentDto) {
    return this.support.addComment(user, id, dto);
  }

  @Get('tickets/:id/comments')
  @RequirePermissions('system:health')
  listComments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.listComments(user, id);
  }

  // ─── Maintenance windows ────────────────────────────────────────────────────

  @Post('maintenance-windows')
  @RequirePermissions('system:health')
  createWindow(@CurrentUser() user: AuthUser, @Body() dto: CreateMaintenanceWindowDto) {
    return this.support.createWindow(user, dto);
  }

  @Get('maintenance-windows')
  @RequirePermissions('system:health')
  listWindows(@CurrentUser() user: AuthUser) {
    return this.support.listWindows(user);
  }

  @Patch('maintenance-windows/:id')
  @RequirePermissions('system:health')
  updateWindow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMaintenanceWindowDto) {
    return this.support.updateWindow(user, id, dto);
  }

  @Delete('maintenance-windows/:id')
  @RequirePermissions('system:health')
  cancelWindow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.cancelWindow(user, id);
  }

  // ─── Announcements ──────────────────────────────────────────────────────────

  @Post('announcements')
  @RequirePermissions('system:health')
  createAnnouncement(@CurrentUser() user: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.support.createAnnouncement(user, dto);
  }

  @Get('announcements')
  @RequirePermissions('system:health')
  listAnnouncements(@CurrentUser() user: AuthUser) {
    return this.support.listAnnouncements(user);
  }

  // Any authenticated user in the lab — the app-shell banner polls this per load.
  @Get('announcements/active')
  activeAnnouncements() {
    return this.support.activeAnnouncements();
  }

  @Patch('announcements/:id')
  @RequirePermissions('system:health')
  updateAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.support.updateAnnouncement(user, id, dto);
  }
}
