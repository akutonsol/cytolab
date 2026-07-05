import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EncryptionService } from '../../common/encryption.service';
import { MailModule } from '../portal/mail/mail.module';
import { AuthSecurityAdminController } from './auth-security-admin.controller';
import { IpBlockGuard } from './ip-block.guard';
import { LoginProtectionService } from './login-protection.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { PasswordPolicyService } from './password-policy.service';
import { ProfileSecurityController } from './profile-security.controller';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { SessionActivityInterceptor } from './session-activity.interceptor';
import { SessionService } from './session.service';

/**
 * Enterprise security subsystem: password policy, sessions, login protection,
 * MFA, PHI encryption, and the Security Center. Also installs the global IP
 * denylist guard and the session idle-timeout interceptor.
 *
 * Exports the services AuthModule composes into the login flow.
 */
@Module({
  imports: [MailModule],
  controllers: [
    SecurityController,
    AuthSecurityAdminController,
    MfaController,
    ProfileSecurityController,
  ],
  providers: [
    EncryptionService,
    PasswordPolicyService,
    SessionService,
    LoginProtectionService,
    MfaService,
    SecurityService,
    { provide: APP_GUARD, useClass: IpBlockGuard },
    { provide: APP_INTERCEPTOR, useClass: SessionActivityInterceptor },
  ],
  exports: [
    EncryptionService,
    PasswordPolicyService,
    SessionService,
    LoginProtectionService,
    MfaService,
  ],
})
export class SecurityModule {}
