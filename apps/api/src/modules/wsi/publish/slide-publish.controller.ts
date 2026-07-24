import {
  ConflictException,
  Controller,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { IllegalPublicationTargetError, PublicationStateError } from '../processing/slide-publication.service';
import { SlidePublishService } from './slide-publish.service';
import { PublishResponse } from './dto/slide-publish.dto';

/**
 * Program 5B · P5-6.3 — STAFF-authenticated deliberate publication. Behind the global JwtAuthGuard +
 * PermissionsGuard (@RequirePermissions wsi:publish); lab scope comes from the JWT principal, and the
 * SlidePublishService enforces generation↔slide↔lab ownership before the frozen publication runs.
 *
 * Result → HTTP (frozen mapping): new/already-published → 200; not-publishable → 409; missing/cross-slide/
 * cross-lab → 404; lifecycle/integrity divergence → 500 (generic body — no internal invariant detail leaks).
 * Publication is a human clinical action; the worker never reaches this path.
 */
@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi/slides')
export class SlidePublishController {
  constructor(private readonly publish: SlidePublishService) {}

  @Post(':slideId/generations/:generationId/publish')
  @RequirePermissions('wsi:publish')
  @HttpCode(200) // state transition, not resource creation (D-F63)
  async publishGeneration(
    @CurrentUser() user: AuthUser,
    @Param('slideId') slideId: string,
    @Param('generationId') generationId: string,
  ): Promise<PublishResponse> {
    let result;
    try {
      result = await this.publish.publish(user.labId, slideId, generationId, user.userId);
    } catch (e) {
      if (e instanceof NotFoundException) throw e; // ownership gate → 404
      if (e instanceof IllegalPublicationTargetError || e instanceof PublicationStateError) {
        throw new InternalServerErrorException('publication state error'); // integrity → 500, generic
      }
      throw e;
    }

    switch (result.outcome) {
      case 'PUBLISHED':
        return {
          outcome: 'PUBLISHED',
          applied: true,
          generationId,
          publicationEventId: result.publicationEventId,
          supersededGenerationId: result.supersededGenerationId,
        };
      case 'ALREADY_PUBLISHED':
        return { outcome: 'ALREADY_PUBLISHED', applied: false, generationId };
      case 'NOT_PUBLISHABLE':
        throw new ConflictException({ outcome: 'NOT_PUBLISHABLE', generationStatus: result.generationStatus });
    }
  }
}
