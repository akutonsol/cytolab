import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LabContext } from './lab-context';
import { LabContextInterceptor } from './lab-context.interceptor';

/**
 * Provides the request-scoped tenant context used by the Prisma tenancy guard.
 * Global so {@link LabContext} can be injected anywhere (notably PrismaService)
 * without re-importing. The interceptor binds the JWT's labId onto each request.
 */
@Global()
@Module({
  providers: [
    LabContext,
    { provide: APP_INTERCEPTOR, useClass: LabContextInterceptor },
  ],
  exports: [LabContext],
})
export class TenancyModule {}
