import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LabContext } from '../common/tenancy/lab-context';
import { tenancyExtension } from '../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../common/crypto/phi-encryption.extension';

/**
 * Autoscale-friendly connection pooling. On Cloud Run, MANY instances each hold a
 * pool, so the per-instance pool must be SMALL — size `connection_limit` so
 * (max instances × limit) stays under the Cloud SQL `max_connections` budget.
 *
 * Config-only + behavior-neutral: when neither `DATABASE_CONNECTION_LIMIT` nor
 * `DATABASE_POOL_TIMEOUT` is set, this returns `undefined` and Prisma uses the raw
 * `DATABASE_URL` and its default pool exactly as before. Pure/exported for testing.
 */
export function poolDatasourceOptions(): { datasources: { db: { url: string } } } | undefined {
  const url = process.env.DATABASE_URL;
  const limit = process.env.DATABASE_CONNECTION_LIMIT;
  const timeout = process.env.DATABASE_POOL_TIMEOUT;
  if (!url || (!limit && !timeout)) return undefined; // no override → unchanged behavior
  const u = new URL(url);
  if (limit) u.searchParams.set('connection_limit', limit);
  if (timeout) u.searchParams.set('pool_timeout', timeout);
  return { datasources: { db: { url: u.toString() } } };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly labContext: LabContext) {
    // Explicit, env-driven pool sizing for autoscale; undefined = Prisma default.
    super(poolDatasourceOptions());
    // Apply the global tenancy guard. `$extends` returns a new, extended client;
    // returning it from the constructor makes every injected PrismaService
    // lab-scoped automatically. Cast back to PrismaService for DI typing — model
    // delegates and `$`-methods are forwarded to the underlying client.
    //
    // Why this is safe re: lifecycle: the object Nest holds is the *extended*
    // client, and `onModuleInit`/`onModuleDestroy` below are defined on the base
    // instance — Nest may or may not see them through the extension proxy. It
    // doesn't matter: Prisma connects lazily on the first query, so even if
    // `$connect()` is never called explicitly the client still works. The hooks
    // are kept as a best-effort eager connect / clean disconnect, not a
    // correctness requirement.
    // Two chained extensions: the tenancy guard (lab/client scoping) and
    // transparent PHI field encryption. Both are $allModels/$allOperations
    // wrappers and compose cleanly.
    return this.$extends(tenancyExtension(labContext))
      .$extends(phiEncryptionExtension()) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
