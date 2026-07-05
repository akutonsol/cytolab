import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { STAFF_AUDIENCE } from '../../portal/common/portal-principal';
import { ACCESS_COOKIE } from '../../security/session.service';

/** Read the access token from the HttpOnly cookie (preferred), else the header. */
const cookieExtractor = (req: Request): string | null => {
  const token = (req as any)?.cookies?.[ACCESS_COOKIE];
  return typeof token === 'string' && token.length > 0 ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      // Dual-mode: HttpOnly cookie first, then Authorization: Bearer, so existing
      // header-based sessions keep working through the cookie migration.
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
      // Reject any token not minted for staff (defence in depth on top of the
      // separate signing secret — a portal token also fails signature here).
      audience: STAFF_AUDIENCE,
    });
  }

  validate(payload: JwtPayload) {
    if (payload.scope !== 'staff') throw new UnauthorizedException();
    // Only full access tokens authenticate a request. A pre-MFA `mfa` token or a
    // `refresh` token must never be usable as a bearer to reach protected routes
    // (that would defeat MFA / token rotation). Legacy tokens omit `type` and are
    // treated as access tokens.
    if (payload.type && payload.type !== 'access') throw new UnauthorizedException();
    // Attached to request.user. `kind` discriminates staff vs portal principals.
    return {
      kind: 'staff' as const,
      userId: payload.sub,
      labId: payload.labId,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      isSuperRole: payload.isSuperRole === true,
      sessionId: payload.sid,
    };
  }
}
