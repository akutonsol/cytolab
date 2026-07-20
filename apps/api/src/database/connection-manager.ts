import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

export interface LabConnectionInfo {
  id: string;
  tenancyMode?: 'POOL' | 'SILO' | null;
  databaseSecretRef?: string | null;
}

/**
 * Connection seam for hybrid tenancy (pool + silo).
 *
 * Phase 0 is BEHAVIOR-NEUTRAL: `forLab()` always returns the shared, lab-scoped
 * pool client. This is the single, localized place that will later resolve a
 * per-SILO client (with the SAME tenancy extension) from the lab's
 * `databaseSecretRef` — so adding silos is a change here, not app-wide surgery.
 * See docs/architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md §4.
 */
@Injectable()
export class ConnectionManager {
  private readonly logger = new Logger(ConnectionManager.name);

  constructor(private readonly pool: PrismaService) {}

  /** The tenancy-governed client for a lab. Phase 0: always the pool client. */
  forLab(lab?: LabConnectionInfo): PrismaService {
    if (lab?.tenancyMode === 'SILO') {
      // TODO(silo): resolve + cache a dedicated client for lab.databaseSecretRef
      // (applyTenancyExtension(new PrismaClient({ datasources: { db: { url } } }))),
      // capped by an LRU with idle eviction. No silo is provisioned yet, so this
      // branch is not exercised in practice; fall back to the pool and warn.
      this.logger.warn(`forLab(${lab.id}): SILO routing not yet implemented — using pool client`);
    }
    return this.pool;
  }
}
