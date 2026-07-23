import { ConflictException, Controller, InternalServerErrorException, NotFoundException, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { DeliverySessionService, SlideNotAccessibleError } from './delivery-session.service';
import { IllegalPublishedGenerationError, PublicationDivergenceError, SlideNotPublishedError } from './published-generation.resolver';
import { VIEWER_SCOPES, WSI_VIEW_PERMISSION } from './delivery.constants';

/**
 * P5-5B-i — STAFF-authenticated delivery-session issuance. Behind the global JwtAuthGuard + PermissionsGuard
 * (@RequirePermissions wsi:view) and lab-scoped via the JWT principal. Returns the raw capability token
 * ONCE; the caller never chooses scopes (server policy VIEWER_SCOPES) and never names a generation.
 */
@Controller('wsi/slides')
export class SlideDeliverySessionController {
  constructor(private readonly sessions: DeliverySessionService) {}

  @Post(':slideId/delivery-session')
  @RequirePermissions(WSI_VIEW_PERMISSION)
  async createSession(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string) {
    try {
      const r = await this.sessions.issue({ labId: user.labId, actorUserId: user.userId, slideId, scopes: VIEWER_SCOPES });
      return {
        token: r.rawToken, // returned ONCE
        sessionId: r.session.sessionId,
        generationId: r.session.generationId, // read-only metadata; never accepted as request input
        scopes: r.session.scopes,
        expiresAt: r.session.expiresAt,
      };
    } catch (e) {
      if (e instanceof SlideNotAccessibleError) throw new NotFoundException('slide not found'); // cross-lab/missing → 404 (no leak)
      if (e instanceof SlideNotPublishedError) throw new ConflictException('slide has no published generation'); // authorized same-lab → 409
      if (e instanceof PublicationDivergenceError || e instanceof IllegalPublishedGenerationError) {
        throw new InternalServerErrorException('publication state error'); // integrity
      }
      throw e;
    }
  }
}
