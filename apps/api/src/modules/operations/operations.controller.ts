import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiBearerAuth()
@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  /** Live command-center overview: pipeline stages (B1) + attention rail (A1). */
  @Get('overview')
  @RequirePermissions('record:view')
  overview() {
    return this.operations.overview();
  }
}
