import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  PORTAL_AUDIENCE,
  PortalJwtPayload,
  PortalPrincipal,
} from '../common/portal-principal';

/**
 * Portal JWT strategy ('jwt-portal'). Uses a SEPARATE secret and audience from
 * the staff strategy, so a staff token presented here fails signature/audience
 * verification, and a portal token fails on the staff strategy. The principal it
 * returns carries kind:'portal' + clientId, which the tenancy interceptor uses
 * to client-scope every query.
 */
@Injectable()
export class PortalJwtStrategy extends PassportStrategy(Strategy, 'jwt-portal') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_PORTAL_SECRET') ?? 'dev-portal-secret',
      audience: PORTAL_AUDIENCE,
    });
  }

  validate(payload: PortalJwtPayload): PortalPrincipal {
    if (payload.scope !== 'portal' || payload.type !== 'access') {
      throw new UnauthorizedException();
    }
    return {
      kind: 'portal',
      portalUserId: payload.sub,
      labId: payload.labId,
      clientId: payload.clientId,
      email: payload.email,
    };
  }
}
