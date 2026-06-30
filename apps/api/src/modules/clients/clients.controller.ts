import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ClientQueryDto, CreateClientDto, CreateClientTypeDto, UpdateClientDto } from './dto/client.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@ApiBearerAuth()
@Controller()
export class ClientsController {
  constructor(private clients: ClientsService) {}

  @Get('clients')
  @RequirePermissions('client:view')
  findAll(@CurrentUser() user: AuthUser, @Query() query: ClientQueryDto) {
    return this.clients.findAll(user.labId, query);
  }

  @Get('client/:id')
  @RequirePermissions('client:view')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.findOne(user.labId, id);
  }

  @Post('client')
  @RequirePermissions('client:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user.labId, dto);
  }

  @Put('client/update/:id')
  @RequirePermissions('client:change')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clients.update(user.labId, id, dto);
  }

  @Delete('client/delete/:id')
  @RequirePermissions('client:delete')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.remove(user.labId, id);
  }

  // ClientType endpoints (supporting the client:create / client:view permission scope)
  @Get('client-types')
  @RequirePermissions('client:view')
  findAllClientTypes(@CurrentUser() user: AuthUser) {
    return this.clients.findAllClientTypes(user.labId);
  }

  @Post('client-types')
  @RequirePermissions('client:create')
  createClientType(@CurrentUser() user: AuthUser, @Body() dto: CreateClientTypeDto) {
    return this.clients.createClientType(user.labId, dto);
  }
}
