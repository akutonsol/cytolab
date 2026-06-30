import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portal } from '../common/portal-principal';
import { PortalAuthGuard } from '../auth/portal-auth.guard';
import { PortalRecordsService } from './portal-records.service';
import { PortalRecordQueryDto } from './dto/portal-record.dto';

/**
 * Portal sample tracking. @Portal() + PortalAuthGuard authenticate with the
 * portal token; the tenancy guard does the client-scoping, so there is no
 * permission decorator and no manual clientId filter here.
 */
@ApiTags('portal-records')
@ApiBearerAuth()
@Portal()
@UseGuards(PortalAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('portal/records')
export class PortalRecordsController {
  constructor(private records: PortalRecordsService) {}

  @Get()
  @ApiOperation({ summary: "List the client's records with their status timeline" })
  findAll(@Query() query: PortalRecordQueryDto) {
    return this.records.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.records.findOne(id);
  }
}
