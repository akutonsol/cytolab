import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequisitionPortalService } from './requisition-portal.service';
import { ConfirmPaymentDto, InternalBatchQueryDto, RejectBatchDto } from './dto/portal.dto';

/**
 * Internal (lab staff) view of incoming portal batches. Authenticated by the
 * global staff JWT guard; each route is permission-gated. Batches are tenancy-
 * scoped to the staff member's own lab.
 */
@ApiTags('portal-requisitions-internal')
@ApiBearerAuth()
@Controller('portal/internal/batches')
export class RequisitionPortalInternalController {
  constructor(private service: RequisitionPortalService) {}

  @Get()
  @RequirePermissions('requisition:view')
  list(@Query() query: InternalBatchQueryDto) {
    return this.service.internalList(query);
  }

  @Patch(':id/process')
  @RequirePermissions('requisition:create')
  process(@Param('id') id: string) {
    return this.service.internalProcess(id);
  }

  @Patch(':id/complete')
  @RequirePermissions('requisition:create')
  complete(@Param('id') id: string) {
    return this.service.internalComplete(id);
  }

  @Patch(':id/reject')
  @RequirePermissions('requisition:create')
  reject(@Param('id') id: string, @Body() dto: RejectBatchDto) {
    return this.service.internalReject(id, dto);
  }

  @Patch(':id/payment/confirm')
  @RequirePermissions('requisition:create')
  confirmPayment(@Param('id') id: string, @Body() dto: ConfirmPaymentDto) {
    return this.service.internalConfirmPayment(id, dto);
  }
}
