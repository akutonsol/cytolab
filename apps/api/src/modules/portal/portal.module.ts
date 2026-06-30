import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../database/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { MailModule } from './mail/mail.module';
import { PortalAuthController } from './auth/portal-auth.controller';
import { PortalAuthService } from './auth/portal-auth.service';
import { PortalJwtStrategy } from './auth/portal-jwt.strategy';
import { PortalUsersController } from './portal-users/portal-users.controller';
import { PortalUsersService } from './portal-users/portal-users.service';
import { PortalRecordsController } from './records/portal-records.controller';
import { PortalRecordsService } from './records/portal-records.service';
import { PortalReportsController } from './reports/portal-reports.controller';
import { PortalReportsService } from './reports/portal-reports.service';

/**
 * Client Portal (F2). Houses the external (portal) auth surface and the
 * staff-facing provisioning of portal users. Portal data modules (sample
 * tracking, reports, change requests) are added here as they are built.
 */
@Module({
  imports: [PrismaModule, PassportModule, JwtModule.register({}), MailModule, ReportsModule],
  controllers: [PortalAuthController, PortalUsersController, PortalRecordsController, PortalReportsController],
  providers: [PortalAuthService, PortalJwtStrategy, PortalUsersService, PortalRecordsService, PortalReportsService],
})
export class PortalModule {}
