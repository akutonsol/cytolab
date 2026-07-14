import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AncillaryOrdersService } from './ancillary-orders.service';
import { CreateAncillaryOrderDto } from './dto/create-ancillary-order.dto';
import { UpdateAncillaryStatusDto } from './dto/update-ancillary-status.dto';
import { QueryAncillaryOrdersDto } from './dto/query-ancillary-orders.dto';

/**
 * Ancillary & IHC ordering owner endpoints (Phase 4.1A · B3).
 *
 * Reads gate on `record:view`, mutations on `record:change` — reusing existing
 * permission codes (Option A; no `ancillary:*` codes). `labId` and the requester
 * id are derived from the authenticated principal, never from the client.
 * Static routes (`queue`, `record/:recordId`) are declared before `:id`.
 */
@ApiTags('ancillary-orders')
@ApiBearerAuth()
@Controller('ancillary-orders')
export class AncillaryOrdersController {
  constructor(private readonly service: AncillaryOrdersService) {}

  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAncillaryOrderDto) {
    return this.service.create(user.labId, user.userId, dto);
  }

  @Get('queue')
  @RequirePermissions('record:view')
  queue(@Query() query: QueryAncillaryOrdersDto) {
    return this.service.queue(query);
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  listByRecord(@Param('recordId') recordId: string) {
    return this.service.listByRecord(recordId);
  }

  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Patch(':id/status')
  @RequirePermissions('record:change')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAncillaryStatusDto,
  ) {
    return this.service.updateStatus(user.labId, id, dto);
  }
}
