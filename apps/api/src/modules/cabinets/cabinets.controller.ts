import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CabinetsService } from './cabinets.service';
import { CabinetRecordsQueryDto, CreateCabinetDto, UpdateCabinetDto } from './dto/cabinet.dto';

@ApiTags('cabinets')
@ApiBearerAuth()
@Controller()
export class CabinetsController {
  constructor(private cabinets: CabinetsService) {}

  // Queries are lab-scoped automatically by the tenancy guard (labId from JWT).
  @Get('cabinets')
  @RequirePermissions('cabinet:view')
  findAll() {
    return this.cabinets.findAll();
  }

  @Get('cabinet/records/:id')
  @RequirePermissions('cabinet:view')
  records(@Param('id') id: string, @Query() query: CabinetRecordsQueryDto) {
    return this.cabinets.records(id, query);
  }

  @Post('cabinet/create')
  @RequirePermissions('cabinet:create')
  create(@Body() dto: CreateCabinetDto) {
    return this.cabinets.create(dto);
  }

  @Put('cabinet/update/:id')
  @RequirePermissions('cabinet:change')
  update(@Param('id') id: string, @Body() dto: UpdateCabinetDto) {
    return this.cabinets.update(id, dto);
  }

  // Legacy CabinetController exposed no delete:Cabinet permission; delete reuses cabinet:change.
  @Delete('cabinet/delete/:id')
  @RequirePermissions('cabinet:change')
  remove(@Param('id') id: string) {
    return this.cabinets.remove(id);
  }
}
