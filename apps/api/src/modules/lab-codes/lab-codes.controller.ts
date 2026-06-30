import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { LabCodesService } from './lab-codes.service';
import { CreateLabCodeDto } from './dto/lab-code.dto';

@ApiTags('lab-codes')
@ApiBearerAuth()
@Controller()
export class LabCodesController {
  constructor(private labCodes: LabCodesService) {}

  @Get('labcodes')
  @RequirePermissions('labcode:view')
  findAll() {
    return this.labCodes.findAll();
  }

  @Post('labcodes')
  @RequirePermissions('labcode:create')
  create(@Body() dto: CreateLabCodeDto) {
    return this.labCodes.create(dto);
  }

  // Legacy used delete:Tax here (a clear legacy bug); using the correct labcode:delete.
  @Delete('labcodes/delete/:id')
  @RequirePermissions('labcode:delete')
  remove(@Param('id') id: string) {
    return this.labCodes.remove(id);
  }
}
