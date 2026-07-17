import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AIScreeningService } from './ai-screening.service';
import { ReviewScreeningDto } from './dto/ai-screening.dto';

// Program 1 · P1-1 containment: every route is gated on the AI_SCREENING flag
// (403 FEATURE_DISABLED when off). The flag is held OFF for all labs; the service
// carries a hard backstop so simulated output can never reach clinical use even if
// the flag is re-enabled. Real image inference is Program 6.
@ApiTags('ai-screening')
@ApiBearerAuth()
@RequireFeature('AI_SCREENING')
@UseGuards(FeatureGuard)
@Controller('ai-screening')
export class AIScreeningController {
  constructor(private readonly ai: AIScreeningService) {}

  @Get('analytics')
  @RequirePermissions('record:view')
  analytics() {
    return this.ai.analytics();
  }

  @Get('queue')
  @RequirePermissions('record:view')
  queue() {
    return this.ai.queue();
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  byRecord(@Param('recordId') recordId: string) {
    return this.ai.getByRecord(recordId);
  }

  @Post('record/:recordId')
  @RequirePermissions('record:change')
  trigger(@Param('recordId') recordId: string) {
    return this.ai.triggerScreening(recordId);
  }

  @Patch(':id/review')
  @RequirePermissions('record:change')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewScreeningDto) {
    return this.ai.review(id, dto, user.userId);
  }
}
