import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RecallService } from './recall.service';
import {
  CompleteRecallDto, GenerateListQueryDto, ManualRecallDto, NotesDto, RecallQueryDto, UpdateRecallDto,
} from './dto/recall.dto';

@ApiTags('recalls')
@ApiBearerAuth()
@Controller('recalls')
export class RecallController {
  constructor(private readonly recalls: RecallService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: RecallQueryDto) {
    return this.recalls.list(query);
  }

  // Static sub-routes before /:id.
  @Get('summary')
  @RequirePermissions('record:view')
  summary() {
    return this.recalls.summary();
  }

  @Get('generate-list')
  @RequirePermissions('record:view')
  generateList(@Query() query: GenerateListQueryDto) {
    return this.recalls.generateList(query);
  }

  @Get('patient/:patientId')
  @RequirePermissions('record:view')
  byPatient(@Param('patientId') patientId: string) {
    return this.recalls.byPatient(patientId);
  }

  @Post('manual')
  @RequirePermissions('record:change')
  manual(@Body() dto: ManualRecallDto) {
    return this.recalls.manual(dto);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.recalls.detail(id);
  }

  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateRecallDto) {
    return this.recalls.update(id, dto);
  }

  @Post(':id/complete')
  @RequirePermissions('record:change')
  complete(@Param('id') id: string, @Body() dto: CompleteRecallDto) {
    return this.recalls.complete(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('record:change')
  cancel(@Param('id') id: string, @Body() dto: NotesDto) {
    return this.recalls.cancel(id, dto);
  }

  @Post(':id/decline')
  @RequirePermissions('record:change')
  decline(@Param('id') id: string, @Body() dto: NotesDto) {
    return this.recalls.decline(id, dto);
  }

  @Post(':id/notify-client')
  @RequirePermissions('record:change')
  notifyClient(@Param('id') id: string) {
    return this.recalls.notifyClient(id);
  }
}
