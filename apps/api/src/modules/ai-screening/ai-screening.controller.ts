import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AIScreeningService } from './ai-screening.service';
import { ReviewScreeningDto } from './dto/ai-screening.dto';

@ApiTags('ai-screening')
@ApiBearerAuth()
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
