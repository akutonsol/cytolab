import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionContextService } from './execution-context.service';
import { PrincipalLike } from './execution-context.types';

/**
 * Program 2 · P2-2 — binds the authenticated principal onto the execution context after the
 * JWT guard has populated `request.user`. Registered globally (APP_INTERCEPTOR) alongside the
 * tenancy interceptor; the two are independent (both read `request.user`), so their relative
 * order does not matter. Identity is taken only from the trusted principal, never the payload.
 * Reads a normalized route TEMPLATE (never a concrete URL with ids) to avoid leaking identifiers.
 */
@Injectable()
export class ExecutionContextInterceptor implements NestInterceptor {
  constructor(private readonly executionContext: ExecutionContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req: any = context.switchToHttp().getRequest();
    const principal = req?.user as PrincipalLike | undefined;
    this.executionContext.bindPrincipal(principal, routeTemplate(req));
    return next.handle();
  }
}

/**
 * Best-effort normalized route template: Express fills `req.route.path` once the route matched
 * (e.g. "/:id"), combined with the router mount `req.baseUrl` (e.g. "/records"). Returns
 * undefined rather than a concrete URL when no template is available, so identifiers never leak.
 */
function routeTemplate(req: any): string | undefined {
  const path: string | undefined = req?.route?.path;
  if (!path) return undefined;
  const base: string = req?.baseUrl ?? '';
  return `${base}${path}` || undefined;
}
