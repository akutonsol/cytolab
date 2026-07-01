import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ServicesCatalogService } from './services-catalog.service';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto/service.dto';

@ApiTags('services-catalog')
@ApiBearerAuth()
@Controller()
export class ServicesCatalogController {
  constructor(private services: ServicesCatalogService) {}

  @Get('services')
  @RequirePermissions('service:view')
  findAll(@Query() query: ServiceQueryDto) {
    return this.services.findAll(query);
  }

  @Post('services')
  @RequirePermissions('service:create')
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Put('services/update/:id')
  @RequirePermissions('service:change')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @Delete('services/delete/:id')
  @RequirePermissions('service:delete')
  remove(@Param('id') id: string) {
    return this.services.remove(id);
  }
}
