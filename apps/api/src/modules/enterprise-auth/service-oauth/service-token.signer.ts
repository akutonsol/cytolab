import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SERVICE_AUDIENCE, SERVICE_SCOPE, SERVICE_TOKEN_ALGS, SERVICE_TOKEN_TTL_SECONDS } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the service-token signing SEAM (D2). ALL machine tokens are signed/verified ONLY here; the
 * `aud=service` / `scope=service` binding keeps them structurally distinct from human tokens (ET6). Today it reuses the
 * existing keyset with a fixed algorithm allowlist; the seam lets a future dedicated SERVICE keyset swap in without any
 * consumer change. `isSuperRole` never applies to a service principal.
 */
export interface ServiceTokenClaims {
  servicePrincipalId: string;
  labId: string;
  permissions: string[];
}

export interface VerifiedServiceToken {
  servicePrincipalId: string;
  labId: string;
  permissions: string[];
}

@Injectable()
export class ServiceTokenSigner {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService) {}

  // D2 seam: the single place the service signing key is resolved (today = existing keyset; future = service keyset).
  private key(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT signing secret is not configured');
    return secret;
  }

  async sign(claims: ServiceTokenClaims): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.servicePrincipalId, labId: claims.labId, permissions: claims.permissions, isSuperRole: false, aud: SERVICE_AUDIENCE, scope: SERVICE_SCOPE, type: 'access' },
      { secret: this.key(), algorithm: SERVICE_TOKEN_ALGS[0], expiresIn: SERVICE_TOKEN_TTL_SECONDS },
    );
  }

  async verify(token: string): Promise<VerifiedServiceToken> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.key(), algorithms: ['HS256'], audience: SERVICE_AUDIENCE });
    } catch {
      throw new UnauthorizedException('invalid service token');
    }
    if (payload.scope !== SERVICE_SCOPE || payload.type !== 'access') throw new UnauthorizedException('not a service access token');
    if (payload.isSuperRole === true) throw new UnauthorizedException('service tokens never carry super-role'); // defence in depth
    if (typeof payload.sub !== 'string' || typeof payload.labId !== 'string') throw new UnauthorizedException('malformed service token');
    const permissions = Array.isArray(payload.permissions) ? (payload.permissions as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    return { servicePrincipalId: payload.sub, labId: payload.labId, permissions };
  }
}
