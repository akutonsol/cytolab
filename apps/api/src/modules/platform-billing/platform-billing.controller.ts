import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SuperuserGuard } from '../auth/guards/superuser.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformBillingService } from './platform-billing.service';
import { InvoiceQueryDto, InvoiceStatusDto, UpsertBillingProfileDto } from './dto/platform-billing.dto';

@ApiTags('platform-billing')
@ApiBearerAuth()
@Controller()
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  // ── Superuser control-center surface (cross-lab) ───────────────────────────
  @Get('platform-billing/labs')
  @UseGuards(SuperuserGuard)
  listLabs() {
    return this.billing.listLabsWithBilling();
  }

  @Get('platform-billing/profile/:labId')
  @UseGuards(SuperuserGuard)
  getProfile(@Param('labId') labId: string) {
    return this.billing.getProfile(labId);
  }

  @Put('platform-billing/profile/:labId')
  @UseGuards(SuperuserGuard)
  upsertProfile(@Param('labId') labId: string, @Body() dto: UpsertBillingProfileDto) {
    return this.billing.upsertProfile(labId, dto);
  }

  @Post('platform-billing/generate/:labId')
  @UseGuards(SuperuserGuard)
  generate(@Param('labId') labId: string, @CurrentUser() user: AuthUser) {
    return this.billing.generateForLab(labId, { generatedBy: user.userId });
  }

  @Get('platform-billing/invoices')
  @UseGuards(SuperuserGuard)
  listInvoices(@Query() query: InvoiceQueryDto) {
    return this.billing.listInvoices(query);
  }

  @Get('platform-billing/invoices/:id')
  @UseGuards(SuperuserGuard)
  getInvoice(@Param('id') id: string) {
    return this.billing.getInvoice(id);
  }

  @Patch('platform-billing/invoices/:id/status')
  @UseGuards(SuperuserGuard)
  setStatus(@Param('id') id: string, @Body() dto: InvoiceStatusDto) {
    return this.billing.setInvoiceStatus(id, dto.status);
  }

  // ── Lab-facing surface (the lab views its own invoices) ────────────────────
  @Get('lab-invoices')
  @RequirePermissions('applicationprefs:view')
  myInvoices() {
    return this.billing.listMyInvoices();
  }

  @Get('lab-invoices/:id')
  @RequirePermissions('applicationprefs:view')
  myInvoice(@Param('id') id: string) {
    return this.billing.getMyInvoice(id);
  }
}
