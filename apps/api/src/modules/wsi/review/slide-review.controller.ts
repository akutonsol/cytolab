import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { SlideReviewService } from './slide-review.service';
import { PublicationHistoryQueryDto } from './dto/slide-review.dto';

/**
 * Program 5B · P5-6.1 — STAFF-authenticated, READ-ONLY clinical review surface. Behind the global
 * JwtAuthGuard + PermissionsGuard; lab scope comes from the JWT principal (`user.labId`), never the path.
 *
 * Authorization is the dedicated `wsi:review` permission (P5-6.2) — catalogued but granted to no default
 * role, so only roles an operator explicitly grants it (and super-roles, via the guard bypass) may read.
 * `wsi:review` is distinct from `wsi:view` (delivery-session issuance) and `wsi:publish` (P5-6.3).
 */
@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi/slides')
export class SlideReviewController {
  constructor(private readonly review: SlideReviewService) {}

  /** R1 — per-slide generation summary + live pointer/integrity. */
  @Get(':slideId/review')
  @RequirePermissions('wsi:review')
  getReview(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string) {
    return this.review.getReviewSummary(user.labId, slideId);
  }

  /** R2 — full QC/verification evidence for one generation of the slide. */
  @Get(':slideId/generations/:generationId/evidence')
  @RequirePermissions('wsi:review')
  getEvidence(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string, @Param('generationId') generationId: string) {
    return this.review.getGenerationEvidence(user.labId, slideId, generationId);
  }

  /** R3 — keyset-paginated publication history for the slide. */
  @Get(':slideId/publications')
  @RequirePermissions('wsi:review')
  getPublications(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string, @Query() query: PublicationHistoryQueryDto) {
    return this.review.getPublicationHistory(user.labId, slideId, query);
  }
}
