import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { QcService } from './qc.service';
import { CreateQCCheckDto, QCQueryDto, ResolveAlertDto, UpdateQCCheckDto } from './dto/qc.dto';

@ApiTags('qc')
@ApiBearerAuth()
@Controller('qc')
export class QcController {
  constructor(private readonly qc: QcService) {}

  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQCCheckDto) {
    return this.qc.create(dto, user.userId);
  }

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: QCQueryDto) {
    return this.qc.list(query);
  }

  // Static sub-routes before /:id.
  @Get('stats')
  @RequirePermissions('record:view')
  stats() {
    return this.qc.stats();
  }

  @Get('alerts')
  @RequirePermissions('record:view')
  alerts() {
    return this.qc.alerts();
  }

  @Patch('alerts/:id/resolve')
  @RequirePermissions('record:change')
  resolveAlert(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveAlertDto) {
    return this.qc.resolveAlert(id, user.userId, dto);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.qc.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateQCCheckDto) {
    return this.qc.update(id, dto);
  }
}
