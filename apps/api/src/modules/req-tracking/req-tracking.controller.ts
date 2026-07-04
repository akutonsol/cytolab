import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ReqTrackingService } from './req-tracking.service';
import { FileDto, ReceiveFormDto, RejectDto, ScanDto, TrackingQueryDto, VerifyDto } from './dto/req-tracking.dto';

@ApiTags('req-tracking')
@ApiBearerAuth()
@Controller('req-tracking')
export class ReqTrackingController {
  constructor(private readonly tracking: ReqTrackingService) {}

  @Get()
  @RequirePermissions('requisition:view')
  list(@Query() query: TrackingQueryDto) {
    return this.tracking.list(query);
  }

  // Static sub-routes before /:requisitionId.
  @Get('stats')
  @RequirePermissions('requisition:view')
  stats() {
    return this.tracking.stats();
  }

  @Post('scan')
  @RequirePermissions('requisition:view')
  scan(@Body() dto: ScanDto) {
    return this.tracking.scan(dto.barcodeValue);
  }

  @Get(':requisitionId')
  @RequirePermissions('requisition:view')
  get(@Param('requisitionId') requisitionId: string) {
    return this.tracking.getByRequisition(requisitionId);
  }

  @Post(':requisitionId/receive-form')
  @RequirePermissions('requisition:change')
  receiveForm(@CurrentUser() user: AuthUser, @Param('requisitionId') id: string, @Body() dto: ReceiveFormDto) {
    return this.tracking.receiveForm(id, user.userId, dto);
  }

  @Post(':requisitionId/receive-bench')
  @RequirePermissions('requisition:change')
  receiveBench(@CurrentUser() user: AuthUser, @Param('requisitionId') id: string) {
    return this.tracking.receiveBench(id, user.userId);
  }

  @Post(':requisitionId/verify')
  @RequirePermissions('requisition:change')
  verify(@CurrentUser() user: AuthUser, @Param('requisitionId') id: string, @Body() dto: VerifyDto) {
    return this.tracking.verify(id, user.userId, dto);
  }

  @Post(':requisitionId/file')
  @RequirePermissions('requisition:change')
  file(@CurrentUser() user: AuthUser, @Param('requisitionId') id: string, @Body() dto: FileDto) {
    return this.tracking.file(id, user.userId, dto);
  }

  @Post(':requisitionId/reject')
  @RequirePermissions('requisition:change')
  reject(@CurrentUser() user: AuthUser, @Param('requisitionId') id: string, @Body() dto: RejectDto) {
    return this.tracking.reject(id, user.userId, dto);
  }
}
