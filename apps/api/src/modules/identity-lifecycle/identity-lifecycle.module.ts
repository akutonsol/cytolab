import { Module } from '@nestjs/common';
import { IdentityLifecycleController } from './identity-lifecycle.controller';
import { IdentityLifecycleService } from './identity-lifecycle.service';

/**
 * Program 7 · Phase 7B.1 — Identity Lifecycle Core. The single lifecycle command boundary (L8) governing human-identity
 * access-lifecycle transitions (activate / suspend / reactivate / terminal deprovision) with deterministic isActive
 * coordination, coordinated session/refresh revocation + federated-link deactivation, and append-only durable evidence.
 * ADDITIVE and non-invasive: the frozen authentication path, tenancy, and the single PermissionsGuard are unchanged.
 */
@Module({
  controllers: [IdentityLifecycleController],
  providers: [IdentityLifecycleService],
  exports: [IdentityLifecycleService],
})
export class IdentityLifecycleModule {}
