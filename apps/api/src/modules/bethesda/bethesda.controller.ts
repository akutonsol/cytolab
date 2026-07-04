import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BethesdaService } from './bethesda.service';
import { UpsertBethesdaResultDto } from './dto/bethesda.dto';

@ApiTags('bethesda')
@ApiBearerAuth()
@Controller('bethesda')
export class BethesdaController {
  constructor(private bethesda: BethesdaService) {}

  @Get('record/:recordId')
  @RequirePermissions('resultentry:view')
  getByRecord(@Param('recordId') recordId: string) {
    return this.bethesda.getByRecord(recordId);
  }

  @Put('record/:recordId')
  @RequirePermissions('resultentry:change')
  upsert(@CurrentUser() user: AuthUser, @Param('recordId') recordId: string, @Body() dto: UpsertBethesdaResultDto) {
    return this.bethesda.upsert(recordId, dto, user.userId);
  }

  @Delete('record/:recordId')
  @RequirePermissions('resultentry:change')
  remove(@Param('recordId') recordId: string) {
    return this.bethesda.remove(recordId);
  }
}
