import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ExecutionContextService } from './execution-context.service';
import { MalformedCorrelationIdError } from './correlation.util';

/**
 * Program 2 · P2-2 — establishes transport attribution (correlation id, request id, IP/UA,
 * method) on the store opened by LabContextMiddleware. Must be applied AFTER LabContextMiddleware
 * so the AsyncLocalStorage store already exists. It only writes attribution — it changes no
 * tenancy or authorization behaviour — so the request behaves exactly as before, now with a
 * richer context. A malformed inbound X-Correlation-Id is the one rejected case (400); a valid
 * id is reused and an absent one is generated.
 */
@Injectable()
export class ExecutionContextMiddleware implements NestMiddleware {
  constructor(private readonly executionContext: ExecutionContextService) {}

  use(req: Request, _res: Response, next: (err?: unknown) => void): void {
    try {
      this.executionContext.initHttpRequest(req);
    } catch (err) {
      if (err instanceof MalformedCorrelationIdError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    next();
  }
}
