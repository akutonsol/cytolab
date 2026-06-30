import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BillStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { BillingService } from './billing.service';
import { BillQueryDto, CreateBillDto } from './dto/bill.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller()
export class BillingController {
  constructor(private billing: BillingService) {}

  @Post('bill/create')
  @RequirePermissions('bill:create')
  create(@Body() dto: CreateBillDto) {
    return this.billing.create(dto);
  }

  // Static sub-routes before /bill/:id.
  @Get('bills/billed')
  @RequirePermissions('bill:view')
  findBilled(@Query() query: BillQueryDto) {
    return this.billing.findAll(query, [BillStatus.Issued, BillStatus.PartiallyPaid, BillStatus.Paid]);
  }

  @Get('bills/unpaid')
  @RequirePermissions('bill:view')
  findUnpaid(@Query() query: BillQueryDto) {
    return this.billing.findAll(query, [BillStatus.Issued, BillStatus.PartiallyPaid]);
  }

  @Get('bills/paid')
  @RequirePermissions('bill:view')
  findPaid(@Query() query: BillQueryDto) {
    return this.billing.findAll(query, [BillStatus.Paid]);
  }

  @Get('bills/summary')
  @RequirePermissions('bill:view')
  summary() {
    return this.billing.summary();
  }

  @Get('bills')
  @RequirePermissions('bill:view')
  findAll(@Query() query: BillQueryDto) {
    return this.billing.findAll(query);
  }

  @Get('bill/:id')
  @RequirePermissions('bill:view')
  findOne(@Param('id') id: string) {
    return this.billing.findOne(id);
  }

  // Issue a draft bill (advances the record Approved -> Billed).
  @Put('bill/billed/:id')
  @RequirePermissions('bill:change')
  @ApiOperation({ summary: 'Issue a bill (legacy: PUT /bill/billed/:id)' })
  issue(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billing.issue(id, user.userId);
  }

  @Put('bill/viewed/:id')
  @RequirePermissions('bill:change')
  markViewed(@Param('id') id: string) {
    return this.billing.markViewed(id);
  }
}
