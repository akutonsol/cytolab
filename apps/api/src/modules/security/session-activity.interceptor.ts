import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { SessionService } from './session.service';

/**
 * After authentication, enforce the idle window on the request's session (via
 * the JWT `sid` claim) and touch its lastActiveAt. Tokens minted before the
 * cookie migration have no `sid` and are treated as always-active — the dual
 * cookie/header rollout can proceed without invalidating them.
 */
@Injectable()
export class SessionActivityInterceptor implements NestInterceptor {
  constructor(private sessions: SessionService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const user = context.switchToHttp().getRequest()?.user;
    if (user?.kind === 'staff' && user.sessionId) {
      const alive = await this.sessions.touchSession(user.sessionId);
      if (!alive) {
        throw new UnauthorizedException({ code: 'SESSION_IDLE_TIMEOUT', message: 'Session timed out' });
      }
    }
    return next.handle();
  }
}
