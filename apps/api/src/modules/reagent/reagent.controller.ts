import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReagentService } from './reagent.service';
import { CreateReagentDto, QuarantineDto, ReagentQueryDto, UpdateReagentDto, UseReagentDto } from './dto/reagent.dto';

@ApiTags('reagents')
@ApiBearerAuth()
@Controller('reagents')
export class ReagentController {
  constructor(private readonly reagents: ReagentService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: ReagentQueryDto) {
    return this.reagents.list(query);
  }

  // Static sub-routes before /:id.
  @Get('expiring')
  @RequirePermissions('record:view')
  expiring() {
    return this.reagents.expiring();
  }

  @Get('stats')
  @RequirePermissions('record:view')
  stats() {
    return this.reagents.stats();
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  usedOnRecord(@Param('recordId') recordId: string) {
    return this.reagents.usedOnRecord(recordId);
  }

  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReagentDto) {
    return this.reagents.create(dto, user.userId);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.reagents.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateReagentDto) {
    return this.reagents.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('record:change')
  remove(@Param('id') id: string) {
    return this.reagents.remove(id);
  }

  @Post(':id/use')
  @RequirePermissions('record:change')
  use(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UseReagentDto) {
    return this.reagents.use(id, user.userId, dto);
  }

  @Post(':id/quarantine')
  @RequirePermissions('record:change')
  quarantine(@Param('id') id: string, @Body() dto: QuarantineDto) {
    return this.reagents.quarantine(id, dto);
  }

  @Get(':id/affected-records')
  @RequirePermissions('record:view')
  affectedRecords(@Param('id') id: string) {
    return this.reagents.affectedRecords(id);
  }
}
