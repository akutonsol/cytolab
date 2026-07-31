import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SERVICE_AUDIENCE, SERVICE_SCOPE, SERVICE_TOKEN_ALGS } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the dedicated SERVICE-token strategy ('jwt-service'). It accepts ONLY tokens with
 * `aud=service` + `scope=service` + `type=access` — so a human staff token (aud=staff) is rejected here, and the human
 * strategy (aud=staff) rejects a service token: crossover is structurally impossible (ET6). It binds a `SERVICE`
 * principal whose authority is exactly its token permissions; `isSuperRole` is always false and re-asserted here.
 */
@Injectable()
export class ServiceJwtStrategy extends PassportStrategy(Strategy, 'jwt-service') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
      audience: SERVICE_AUDIENCE,
      algorithms: SERVICE_TOKEN_ALGS as unknown as string[],
    });
  }

  validate(payload: Record<string, unknown>) {
    if (payload.scope !== SERVICE_SCOPE || payload.type !== 'access') throw new UnauthorizedException();
    if (payload.isSuperRole === true) throw new UnauthorizedException();
    if (typeof payload.sub !== 'string' || typeof payload.labId !== 'string') throw new UnauthorizedException();
    const permissions = Array.isArray(payload.permissions) ? (payload.permissions as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    return { kind: 'service' as const, servicePrincipalId: payload.sub, principalId: payload.sub, labId: payload.labId, permissions, isSuperRole: false };
  }
}
