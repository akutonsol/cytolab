import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ClientQueryDto, CreateClientDto, CreateClientTypeDto, UpdateClientDto } from './dto/client.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@Controller()
export class ClientsController {
  constructor(private clients: ClientsService) {}

  // Queries are lab-scoped automatically by the tenancy guard (labId from JWT).
  @Get('clients')
  @RequirePermissions('client:view')
  findAll(@Query() query: ClientQueryDto) {
    return this.clients.findAll(query);
  }

  @Get('client/:id')
  @RequirePermissions('client:view')
  findOne(@Param('id') id: string) {
    return this.clients.findOne(id);
  }

  @Post('client')
  @RequirePermissions('client:create')
  create(@Body() dto: CreateClientDto) {
    return this.clients.create(dto);
  }

  @Put('client/update/:id')
  @RequirePermissions('client:change')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(id, dto);
  }

  @Delete('client/delete/:id')
  @RequirePermissions('client:delete')
  remove(@Param('id') id: string) {
    return this.clients.remove(id);
  }

  // ClientType endpoints (supporting the client:create / client:view permission scope)
  @Get('client-types')
  @RequirePermissions('client:view')
  findAllClientTypes() {
    return this.clients.findAllClientTypes();
  }

  @Post('client-types')
  @RequirePermissions('client:create')
  createClientType(@Body() dto: CreateClientTypeDto) {
    return this.clients.createClientType(dto);
  }
}
