import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AiReportingService } from './ai-reporting.service';
import { AcceptNarrativeDto, UpdateAiSettingsDto } from './dto/ai.dto';

@ApiTags('ai-reporting')
@ApiBearerAuth()
@Controller()
export class AiReportingController {
  constructor(private ai: AiReportingService) {}

  // ---- Lab AI settings (Settings > AI Assistance) ----
  @Get('lab/ai-settings')
  @RequirePermissions('applicationprefs:view')
  getSettings() {
    return this.ai.getSettings();
  }

  @Put('lab/ai-settings')
  @RequirePermissions('applicationprefs:change')
  updateSettings(@Body() dto: UpdateAiSettingsDto) {
    return this.ai.updateSettings(dto);
  }

  // ---- Capabilities (on-demand only; each gated on aidraft:create) ----
  @Post('resultsheet/:id/ai/narrative')
  @RequirePermissions('aidraft:create')
  @ApiOperation({ summary: 'Generate a DRAFT report narrative (assistive; never authorizes)' })
  narrative(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.generateNarrative(id, user.userId);
  }

  @Post('resultsheet/:id/ai/suggest-codes')
  @RequirePermissions('aidraft:create')
  suggestCodes(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.suggestCodes(id, user.userId);
  }

  @Post('resultsheet/:id/ai/consistency')
  @RequirePermissions('aidraft:create')
  consistency(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.ai.checkConsistency(id, user.userId);
  }

  @Put('resultsheet/:id/ai/narrative/:draftId/accept')
  @RequirePermissions('aidraft:create')
  @ApiOperation({ summary: 'Accept a narrative draft — records the human finalText + diff; re-opens if authorized' })
  accept(@Param('id') id: string, @Param('draftId') draftId: string, @Body() dto: AcceptNarrativeDto, @CurrentUser() user: AuthUser) {
    return this.ai.acceptNarrative(id, draftId, user.userId, dto.finalText);
  }

  @Put('resultsheet/:id/ai/narrative/:draftId/reject')
  @RequirePermissions('aidraft:create')
  reject(@Param('id') id: string, @Param('draftId') draftId: string) {
    return this.ai.rejectNarrative(id, draftId);
  }
}
