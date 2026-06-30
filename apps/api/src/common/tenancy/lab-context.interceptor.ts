import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { LabContext } from './lab-context';

/**
 * Runs after the JWT guard has populated `request.user`, and binds that
 * principal's scope onto the request store opened by {@link LabContextMiddleware}.
 *
 * Staff principal -> lab scope only. Portal principal (kind === 'portal') ->
 * lab + client scope with the portal flag, so the tenancy guard additionally
 * client-scopes and fails closed on un-scopable tables. The two are
 * discriminated by `kind`, so a portal request can never end up merely
 * lab-scoped (which would defeat client isolation).
 */
@Injectable()
export class LabContextInterceptor implements NestInterceptor {
  constructor(private readonly labContext: LabContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user: any = context.switchToHttp().getRequest()?.user;
    if (user?.kind === 'portal') {
      if (user.labId && user.clientId) this.labContext.setPortalContext(user.labId, user.clientId);
    } else if (user?.labId) {
      this.labContext.setLabId(user.labId);
    }
    return next.handle();
  }
}
