import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_SERVICE_KEY } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the global service-token guard. It runs between JwtAuthGuard and PermissionsGuard and
 * STANDS DOWN (no-op) on every route EXCEPT those marked `@Service()`, so human/portal/public routes are entirely
 * unaffected. On a `@Service()` route it validates the machine token via the dedicated 'jwt-service' strategy
 * (aud=service) and binds the SERVICE principal onto the request; anything else (no token / human token / wrong
 * audience / wrong type-scope / bad signature / missing claims) fails closed — it NEVER falls back to anonymous or
 * human treatment. It performs NO domain authorization: that terminates at the EXISTING single PermissionsGuard (D5).
 */
@Injectable()
export class ServiceAuthGuard extends AuthGuard('jwt-service') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isService = this.reflector.getAllAndOverride<boolean>(IS_SERVICE_KEY, [context.getHandler(), context.getClass()]);
    if (!isService) return true; // stand down on non-@Service routes — zero effect on the human/public/portal path
    return super.canActivate(context); // @Service route → validate the machine token (fail closed on any problem)
  }
}

/** Authoritative route metadata: this route is authenticated by a machine (service) token, not a human. */
export const Service = () => SetMetadata(IS_SERVICE_KEY, true);
