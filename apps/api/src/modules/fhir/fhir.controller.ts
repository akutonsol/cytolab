import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { FhirService } from './fhir.service';
import { CreateEndpointDto, TransmissionQueryDto, TransmitDto, UpdateEndpointDto } from './dto/fhir.dto';

@ApiTags('fhir')
@ApiBearerAuth()
@Controller('fhir')
export class FhirController {
  constructor(private readonly fhir: FhirService) {}

  // ── Endpoints ──────────────────────────────────────────────────────────────
  @Get('endpoints')
  @RequirePermissions('record:view')
  listEndpoints() {
    return this.fhir.listEndpoints();
  }

  @Post('endpoints')
  @RequirePermissions('record:change')
  createEndpoint(@Body() dto: CreateEndpointDto) {
    return this.fhir.createEndpoint(dto);
  }

  @Patch('endpoints/:id')
  @RequirePermissions('record:change')
  updateEndpoint(@Param('id') id: string, @Body() dto: UpdateEndpointDto) {
    return this.fhir.updateEndpoint(id, dto);
  }

  @Delete('endpoints/:id')
  @RequirePermissions('record:change')
  deactivateEndpoint(@Param('id') id: string) {
    return this.fhir.deactivateEndpoint(id);
  }

  @Post('endpoints/:id/test')
  @RequirePermissions('record:change')
  testEndpoint(@Param('id') id: string) {
    return this.fhir.testEndpoint(id);
  }

  // ── Transmissions ────────────────────────────────────────────────────────────
  @Get('transmissions')
  @RequirePermissions('record:view')
  listTransmissions(@Query() query: TransmissionQueryDto) {
    return this.fhir.listTransmissions(query);
  }

  @Get('stats')
  @RequirePermissions('record:view')
  stats() {
    return this.fhir.stats();
  }

  @Get('preview/:recordId')
  @RequirePermissions('record:view')
  preview(@Param('recordId') recordId: string) {
    return this.fhir.preview(recordId);
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  recordHistory(@Param('recordId') recordId: string) {
    return this.fhir.recordHistory(recordId);
  }

  @Post('transmit/:recordId/retry')
  @RequirePermissions('record:change')
  retry(@Param('recordId') recordId: string) {
    return this.fhir.retry(recordId);
  }

  @Post('transmit/:recordId')
  @RequirePermissions('record:change')
  transmit(@Param('recordId') recordId: string, @Body() dto: TransmitDto) {
    return this.fhir.transmit(recordId, dto.endpointId);
  }
}
