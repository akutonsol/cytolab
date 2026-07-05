import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  labId: string;
  email: string;
  roles: string[];
  permissions: string[];
  isSuperRole?: boolean;
  /** Present on cookie-era tokens; used for idle-timeout enforcement. */
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
