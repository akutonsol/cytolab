import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, PaymentQueryDto } from './dto/payment.dto';

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post('payment/create')
  @RequirePermissions('payment:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.payments.create(dto, user.userId);
  }

  // Static sub-routes before /payment/... params.
  @Get('payments/summary')
  @RequirePermissions('payment:view')
  summary() {
    return this.payments.summary();
  }

  @Get('payments')
  @RequirePermissions('payment:view')
  findAll(@Query() query: PaymentQueryDto) {
    return this.payments.findAll(query);
  }

  @Get('bill/payments/:id')
  @RequirePermissions('payment:view')
  paymentsForBill(@Param('id') id: string, @Query() query: PaymentQueryDto) {
    return this.payments.paymentsForBill(id, query);
  }

  @Put('payment/verify/:id')
  @RequirePermissions('payment:change')
  verify(@Param('id') id: string) {
    return this.payments.verify(id);
  }
}
