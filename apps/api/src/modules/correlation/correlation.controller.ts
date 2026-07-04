import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CorrelationService } from './correlation.service';
import { CorrelationQueryDto, CreateCorrelationDto, ReviewCorrelationDto, UpdateCorrelationDto } from './dto/correlation.dto';

@ApiTags('correlation')
@ApiBearerAuth()
@Controller('correlation')
export class CorrelationController {
  constructor(private readonly correlation: CorrelationService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: CorrelationQueryDto) {
    return this.correlation.list(query);
  }

  // Static sub-routes before /:id.
  @Get('analytics')
  @RequirePermissions('record:view')
  analytics() {
    return this.correlation.analytics();
  }

  @Get('patient/:patientId')
  @RequirePermissions('record:view')
  byPatient(@Param('patientId') patientId: string) {
    return this.correlation.byPatient(patientId);
  }

  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCorrelationDto) {
    return this.correlation.create(dto, user.userId);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.correlation.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateCorrelationDto) {
    return this.correlation.update(id, dto);
  }

  @Post(':id/review')
  @RequirePermissions('record:change')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewCorrelationDto) {
    return this.correlation.review(id, user.userId, dto);
  }
}
