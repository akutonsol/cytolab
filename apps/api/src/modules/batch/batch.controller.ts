import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BatchService } from './batch.service';
import { BatchAuthorizeDto, BatchPreviewQueryDto } from './dto/batch.dto';

@ApiTags('batch-authorization')
@ApiBearerAuth()
@Controller('records')
export class BatchController {
  constructor(private readonly batch: BatchService) {}

  @Get('batch-preview')
  @RequirePermissions('resultsheet:authorize')
  preview(@Query() query: BatchPreviewQueryDto) {
    return this.batch.preview(query);
  }

  @Post('batch-authorize')
  @RequirePermissions('resultsheet:authorize')
  authorize(@CurrentUser() user: AuthUser, @Body() dto: BatchAuthorizeDto) {
    return this.batch.authorize(dto, user.userId);
  }
}
