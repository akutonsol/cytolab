import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ServiceAuthGuard } from '../enterprise-auth/service-oauth/service-auth.guard';

@Module({
  imports: [PassportModule, JwtModule.register({}), SecurityModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Global guards, in order: authenticate (staff JWT unless @Public/@Portal/@Service),
    // then — P7-7A.2b — authenticate @Service routes with the machine 'jwt-service' strategy
    // (ServiceAuthGuard stands down on all non-@Service routes), then enforce @RequirePermissions.
    // There is exactly ONE domain-permission evaluator: PermissionsGuard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ServiceAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
