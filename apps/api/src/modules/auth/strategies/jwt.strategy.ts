import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../auth.service';
import { STAFF_AUDIENCE } from '../../portal/common/portal-principal';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
      // Reject any token not minted for staff (defence in depth on top of the
      // separate signing secret — a portal token also fails signature here).
      audience: STAFF_AUDIENCE,
    });
  }

  validate(payload: JwtPayload) {
    if (payload.scope !== 'staff') throw new UnauthorizedException();
    // Attached to request.user. `kind` discriminates staff vs portal principals.
    return {
      kind: 'staff' as const,
      userId: payload.sub,
      labId: payload.labId,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
