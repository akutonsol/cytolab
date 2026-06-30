import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TaxesService } from './taxes.service';
import { CreateTaxDto } from './dto/tax.dto';

@ApiTags('taxes')
@ApiBearerAuth()
@Controller()
export class TaxesController {
  constructor(private taxes: TaxesService) {}

  @Get('taxes')
  @RequirePermissions('tax:view')
  findAll() {
    return this.taxes.findAll();
  }

  @Post('taxes')
  @RequirePermissions('tax:create')
  create(@Body() dto: CreateTaxDto) {
    return this.taxes.create(dto);
  }

  @Delete('taxes/delete/:id')
  @RequirePermissions('tax:delete')
  remove(@Param('id') id: string) {
    return this.taxes.remove(id);
  }
}
