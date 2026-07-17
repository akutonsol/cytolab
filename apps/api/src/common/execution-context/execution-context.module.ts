import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ExecutionContextService } from './execution-context.service';
import { ExecutionContextInterceptor } from './execution-context.interceptor';

/**
 * Program 2 · P2-2 — provides the execution-context accessor over the shared tenant store and
 * registers the interceptor that binds the authenticated principal. Global so
 * {@link ExecutionContextService} can be injected anywhere (as LabContext is). Depends on
 * TenancyModule's LabContext (also global). It does NOT import or activate the Audit module.
 * The HTTP middleware is applied in AppModule alongside LabContextMiddleware.
 */
@Global()
@Module({
  providers: [
    ExecutionContextService,
    { provide: APP_INTERCEPTOR, useClass: ExecutionContextInterceptor },
  ],
  exports: [ExecutionContextService],
})
export class ExecutionContextModule {}
