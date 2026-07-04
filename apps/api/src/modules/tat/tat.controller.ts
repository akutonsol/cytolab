import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TatService } from './tat.service';
import { AlertQueryDto, CreateTATConfigDto, UpdateTATConfigDto } from './dto/tat.dto';

@ApiTags('tat')
@ApiBearerAuth()
@Controller('tat')
export class TatController {
  constructor(private tat: TatService) {}

  @Get('stats')
  @RequirePermissions('record:view')
  stats() {
    return this.tat.getStats();
  }

  @Post('scan')
  @RequirePermissions('record:change')
  scan() {
    return this.tat.scan();
  }

  // ── Configs ──
  @Get('configs')
  @RequirePermissions('record:view')
  listConfigs() {
    return this.tat.listConfigs();
  }

  @Post('configs')
  @RequirePermissions('record:change')
  createConfig(@Body() dto: CreateTATConfigDto) {
    return this.tat.createConfig(dto);
  }

  @Patch('configs/:id')
  @RequirePermissions('record:change')
  updateConfig(@Param('id') id: string, @Body() dto: UpdateTATConfigDto) {
    return this.tat.updateConfig(id, dto);
  }

  @Delete('configs/:id')
  @RequirePermissions('record:change')
  removeConfig(@Param('id') id: string) {
    return this.tat.removeConfig(id);
  }

  // ── Alerts ──
  @Get('alerts')
  @RequirePermissions('record:view')
  listAlerts(@Query() query: AlertQueryDto) {
    return this.tat.listAlerts(query);
  }

  @Patch('alerts/:id/acknowledge')
  @RequirePermissions('record:change')
  acknowledge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tat.acknowledge(id, user.userId);
  }

  @Patch('alerts/:id/resolve')
  @RequirePermissions('record:change')
  resolve(@Param('id') id: string) {
    return this.tat.resolve(id);
  }
}
