import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../database/prisma.module';
import { MailModule } from './mail/mail.module';
import { PortalAuthController } from './auth/portal-auth.controller';
import { PortalAuthService } from './auth/portal-auth.service';
import { PortalJwtStrategy } from './auth/portal-jwt.strategy';
import { PortalUsersController } from './portal-users/portal-users.controller';
import { PortalUsersService } from './portal-users/portal-users.service';

/**
 * Client Portal (F2). Houses the external (portal) auth surface and the
 * staff-facing provisioning of portal users. Portal data modules (sample
 * tracking, reports, change requests) are added here as they are built.
 */
@Module({
  imports: [PrismaModule, PassportModule, JwtModule.register({}), MailModule],
  controllers: [PortalAuthController, PortalUsersController],
  providers: [PortalAuthService, PortalJwtStrategy, PortalUsersService],
})
export class PortalModule {}
