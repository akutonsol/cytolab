import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LabContext } from '../common/tenancy/lab-context';
import { tenancyExtension } from '../common/tenancy/tenancy.extension';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly labContext: LabContext) {
    super();
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
    return this.$extends(tenancyExtension(labContext)) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
