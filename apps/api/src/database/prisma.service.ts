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
    return this.$extends(tenancyExtension(labContext)) as unknown as PrismaService;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
