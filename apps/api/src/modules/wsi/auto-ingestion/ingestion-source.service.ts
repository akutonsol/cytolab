import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';

/**
 * Program 5B · B1 — internal source-configuration persistence. A source's persisted `labId` is the SOLE
 * tenant authority for background discovery (stamped from lab context by the tenancy extension, never from
 * a filename/accession/path). No controllers here: source-management CRUD needs a permission decision that
 * is deferred to B2/B5 authorization.
 */
@Injectable()
export class IngestionSourceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Register a filesystem watch-folder source for the current lab. Unique per (lab, rootPath). */
  create(input: { rootPath: string; matchConfig?: Prisma.InputJsonValue; enabled?: boolean }) {
    return this.prisma.ingestionSource.create({
      data: tenantCreate<Prisma.IngestionSourceUncheckedCreateInput>({
        kind: 'FILESYSTEM',
        rootPath: input.rootPath,
        ...(input.matchConfig !== undefined ? { matchConfig: input.matchConfig } : {}),
        enabled: input.enabled ?? true,
      }),
    });
  }

  /** Enabled sources for the current lab (the B2 poller iterates these under the lab's own context). */
  listEnabled() {
    return this.prisma.ingestionSource.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } });
  }

  get(id: string) {
    return this.prisma.ingestionSource.findFirst({ where: { id } });
  }
}
