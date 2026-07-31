import { Module } from '@nestjs/common';
import { IdentityLifecycleModule } from '../identity-lifecycle/identity-lifecycle.module';
import { MailModule } from '../portal/mail/mail.module';
import { StaffInvitationController } from './staff-invitation.controller';
import { StaffInvitationService } from './staff-invitation.service';

/**
 * Program 7 · Phase 7B.2 — Staff Invitations. Governed entry-by-invitation into the frozen 7B.1 lifecycle: issue /
 * accept / cancel / resend. Delegates every lifecycle transition to `IdentityLifecycleService` (the sole lifecycle
 * writer, L8) and reuses `MailService` for advisory-only delivery. ADDITIVE and non-invasive: no frozen model, tenancy,
 * authentication, or the single PermissionsGuard is changed.
 */
@Module({
  imports: [IdentityLifecycleModule, MailModule],
  controllers: [StaffInvitationController],
  providers: [StaffInvitationService],
  exports: [StaffInvitationService],
})
export class StaffInvitationsModule {}
