import { Injectable, NestMiddleware } from '@nestjs/common';
import { LabContext } from './lab-context';

/**
 * Opens a per-request tenant store at the very start of the request. Guards,
 * interceptors, the route handler and all Prisma queries then run inside this
 * AsyncLocalStorage scope. The `labId` itself is filled in after authentication
 * by {@link LabContextInterceptor}.
 */
@Injectable()
export class LabContextMiddleware implements NestMiddleware {
  constructor(private readonly labContext: LabContext) {}

  use(_req: unknown, _res: unknown, next: () => void): void {
    this.labContext.run({}, () => next());
  }
}
