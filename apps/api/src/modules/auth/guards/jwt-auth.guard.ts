import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { IS_PORTAL_KEY } from '../../portal/common/portal-principal';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    // Portal routes authenticate with the portal JWT strategy (separate secret +
    // audience) via their own PortalAuthGuard — the staff strategy stands down so
    // it never tries (and rejects) a portal token on this guard.
    if (this.reflector.getAllAndOverride<boolean>(IS_PORTAL_KEY, targets)) return true;
    return super.canActivate(context);
  }
}
