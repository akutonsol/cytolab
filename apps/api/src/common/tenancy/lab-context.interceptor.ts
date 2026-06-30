import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthUser } from '../decorators/current-user.decorator';
import { LabContext } from './lab-context';

/**
 * Runs after the JWT guard has populated `request.user`, and binds that user's
 * `labId` onto the request store opened by {@link LabContextMiddleware}. From
 * here on every Prisma query is automatically scoped to this lab.
 */
@Injectable()
export class LabContextInterceptor implements NestInterceptor {
  constructor(private readonly labContext: LabContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user: AuthUser | undefined = context.switchToHttp().getRequest()?.user;
    if (user?.labId) this.labContext.setLabId(user.labId);
    return next.handle();
  }
}
