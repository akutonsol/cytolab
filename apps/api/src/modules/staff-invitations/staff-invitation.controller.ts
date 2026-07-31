import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { StaffInvitationService } from './staff-invitation.service';
import { AcceptInvitationDto, IssueInvitationDto } from './dto/staff-invitation.dto';

/**
 * Program 7 · Phase 7B.2 — Staff Invitations. Administrative routes (issue/cancel/resend) are lab-scoped and require
 * `identityinvitation:manage`, terminating at the existing PermissionsGuard; the one-time token is delivered ONLY by
 * email and is NEVER returned in an HTTP response. Acceptance is `@Public` (the invitee has no session yet) + throttled
 * and token-bound; it activates access via the lifecycle boundary but grants no permission and mints no session.
 */
@ApiTags('staff-invitations')
@Controller('staff-invitations')
export class StaffInvitationController {
  constructor(private readonly invitations: StaffInvitationService) {}

  @Post()
  @RequirePermissions('identityinvitation:manage')
  async issue(@Body() dto: IssueInvitationDto, @CurrentUser() actor: AuthUser) {
    const { invitationId } = await this.invitations.issue(dto, actor.userId); // rawToken emailed, never returned
    return { invitationId };
  }

  @Post(':id/cancel')
  @RequirePermissions('identityinvitation:manage')
  cancel(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.invitations.cancel(id, actor.userId);
  }

  @Post(':id/resend')
  @RequirePermissions('identityinvitation:manage')
  async resend(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    const { invitationId } = await this.invitations.resend(id, actor.userId); // new token emailed, never returned
    return { invitationId };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('accept')
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto.token, dto.password);
  }
}
