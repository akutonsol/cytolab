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
 * Authorization is `record:view` as an INTERIM gate (D-A). P5-6.2 replaces it with a dedicated
 * `wsi:review` permission — `record:view` must NOT become the permanent WSI-review permission.
 */
@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi/slides')
export class SlideReviewController {
  constructor(private readonly review: SlideReviewService) {}

  /** R1 — per-slide generation summary + live pointer/integrity. */
  @Get(':slideId/review')
  @RequirePermissions('record:view') // P5-6.2 → wsi:review
  getReview(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string) {
    return this.review.getReviewSummary(user.labId, slideId);
  }

  /** R2 — full QC/verification evidence for one generation of the slide. */
  @Get(':slideId/generations/:generationId/evidence')
  @RequirePermissions('record:view') // P5-6.2 → wsi:review
  getEvidence(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string, @Param('generationId') generationId: string) {
    return this.review.getGenerationEvidence(user.labId, slideId, generationId);
  }

  /** R3 — keyset-paginated publication history for the slide. */
  @Get(':slideId/publications')
  @RequirePermissions('record:view') // P5-6.2 → wsi:review
  getPublications(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string, @Query() query: PublicationHistoryQueryDto) {
    return this.review.getPublicationHistory(user.labId, slideId, query);
  }
}
