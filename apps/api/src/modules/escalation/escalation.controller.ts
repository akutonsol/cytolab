import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { EscalationService } from './escalation.service';
import { EscalationQueryDto, ManualEscalateDto, ReviewNotesDto } from './dto/escalation.dto';

@ApiTags('escalations')
@ApiBearerAuth()
@Controller('escalations')
export class EscalationController {
  constructor(private readonly escalation: EscalationService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@CurrentUser() user: AuthUser, @Query() query: EscalationQueryDto) {
    return this.escalation.list(query, user.userId);
  }

  @Get('summary')
  @RequirePermissions('record:view')
  summary() {
    return this.escalation.summary();
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.escalation.detail(id);
  }

  @Patch(':id/acknowledge')
  @RequirePermissions('record:change')
  acknowledge(@Param('id') id: string) {
    return this.escalation.acknowledge(id);
  }

  @Patch(':id/review')
  @RequirePermissions('record:change')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.escalation.review(id, user.userId);
  }

  @Patch(':id/resolve')
  @RequirePermissions('record:change')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewNotesDto) {
    return this.escalation.resolve(id, user.userId, dto.notes);
  }

  @Patch(':id/dismiss')
  @RequirePermissions('record:change')
  dismiss(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewNotesDto) {
    return this.escalation.dismiss(id, user.userId, dto.notes);
  }

  @Post('manual')
  @RequirePermissions('record:change')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualEscalateDto) {
    return this.escalation.manual(dto, user.userId);
  }
}
