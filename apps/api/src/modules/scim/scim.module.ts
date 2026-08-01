import { Module } from '@nestjs/common';
import { IdentityLifecycleModule } from '../identity-lifecycle/identity-lifecycle.module';
import { ScimController } from './scim.controller';
import { ScimUsersService } from './scim-users.service';

/**
 * Program 7 · Phase 7B.3 — SCIM Users. Inbound SCIM 2.0 provisioning as TRANSPORT into the frozen 7B.1 lifecycle:
 * create / read / list / replace / patch / deprovision, all through `IdentityLifecycleService` (the sole lifecycle
 * writer, L8). ADDITIVE and non-invasive: it reuses the frozen 7A.2b machine-auth path (`@Service` + `ServiceAuthGuard`)
 * and the single `PermissionsGuard`; it introduces no credential model, changes no tenancy, mints no session, and never
 * touches passwords, federation, roles, or the clinical/AI path.
 */
@Module({
  imports: [IdentityLifecycleModule],
  controllers: [ScimController],
  providers: [ScimUsersService],
  exports: [ScimUsersService],
})
export class ScimModule {}
