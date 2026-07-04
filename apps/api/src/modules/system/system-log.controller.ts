import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SystemLogService } from './system-log.service';
import { SystemLogQueryDto } from './dto/system-log.dto';

@ApiTags('system')
@ApiBearerAuth()
@Controller()
export class SystemLogController {
  constructor(private readonly logs: SystemLogService) {}

  // Superuser-only (superusers bypass the permission guard; no default role holds
  // system:health), so the unified audit log is never exposed to lab staff.
  @Get('system/logs')
  @RequirePermissions('system:health')
  getLogs(@Query() query: SystemLogQueryDto) {
    return this.logs.getLogs(query);
  }
}
