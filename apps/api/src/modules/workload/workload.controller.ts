import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RecordsService } from '../records/records.service';
import { WorkloadService } from './workload.service';
import { UpsertTargetDto } from './dto/workload.dto';

@ApiTags('workload')
@ApiBearerAuth()
@Controller('workload')
export class WorkloadController {
  constructor(
    private readonly workload: WorkloadService,
    private readonly records: RecordsService,
  ) {}

  @Get('summary')
  @RequirePermissions('record:view')
  summary() {
    return this.workload.summary();
  }

  @Get('unassigned')
  @RequirePermissions('record:view')
  unassigned() {
    return this.records.unassigned();
  }

  @Get('history')
  @RequirePermissions('record:view')
  history() {
    return this.workload.history();
  }

  @Get('targets')
  @RequirePermissions('record:view')
  targets() {
    return this.workload.listTargets();
  }

  @Post('targets')
  @RequirePermissions('record:change')
  upsertTarget(@Body() dto: UpsertTargetDto) {
    return this.workload.upsertTarget(dto);
  }
}
