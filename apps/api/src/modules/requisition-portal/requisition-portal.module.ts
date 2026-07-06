import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../portal/mail/mail.module';
import { RequisitionPortalController } from './requisition-portal.controller';
import { RequisitionPortalInternalController } from './requisition-portal-internal.controller';
import { RequisitionPaymentController } from './requisition-payment.controller';
import { RequisitionPortalService } from './requisition-portal.service';
import { OcrService } from './ocr.service';
import { ManifestService } from './manifest.service';
import { PowerTranzService } from './powertranz.service';

/**
 * Digital Requisition Portal (DRP). Client-facing batch/form/scan/payment
 * surface (@Portal, portal JWT) plus a staff-facing internal controller. Portal
 * auth is provided by the already-registered PortalModule's jwt-portal strategy.
 */
@Module({
  imports: [PrismaModule, NotificationsModule, MailModule],
  controllers: [RequisitionPortalController, RequisitionPortalInternalController, RequisitionPaymentController],
  providers: [RequisitionPortalService, OcrService, ManifestService, PowerTranzService],
})
export class RequisitionPortalModule {}
