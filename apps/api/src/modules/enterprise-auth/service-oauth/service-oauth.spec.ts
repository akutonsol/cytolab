import { JwtService } from '@nestjs/jwt';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ServiceTokenSigner } from './service-token.signer';
import { ServiceJwtStrategy } from './service-jwt.strategy';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';
import { SERVICE_AUDIENCE } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the service-token contract + crossover + single-enforcement-boundary (pure, no DB). Proves:
 * the signer mints a distinct `aud=service` token with `isSuperRole=false` and no `sid`; the service strategy accepts
 * only service tokens (human/super/wrong-scope rejected); and a SERVICE principal's token permissions are enforced by
 * the REAL existing `PermissionsGuard` (D5 — one authorization boundary).
 */
const SECRET = 'test-jwt-secret-000000000000000000000000';
const config: any = { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) };
const jwt = new JwtService({});

describe('P7-7A.2b service token + crossover + PermissionsGuard enforcement', () => {
  const signer = new ServiceTokenSigner(jwt, config);
  const strategy = new ServiceJwtStrategy(config);

  it('mints a distinct service token (aud=service, isSuperRole=false, no sid) and verifies it', async () => {
    const token = await signer.sign({ servicePrincipalId: 'sp-1', labId: 'lab-1', permissions: ['record:view'] });
    const decoded: any = jwt.decode(token);
    expect(decoded.aud).toBe(SERVICE_AUDIENCE);
    expect(decoded.scope).toBe('service');
    expect(decoded.type).toBe('access');
    expect(decoded.isSuperRole).toBe(false);
    expect(decoded.sid).toBeUndefined(); // no session
    const v = await signer.verify(token);
    expect(v).toEqual({ servicePrincipalId: 'sp-1', labId: 'lab-1', permissions: ['record:view'] });
  });

  it('the signer rejects a non-service token (a staff-audience token) — crossover blocked', async () => {
    const staff = await jwt.signAsync({ sub: 'u', labId: 'l', scope: 'staff', type: 'access', aud: 'staff' }, { secret: SECRET, algorithm: 'HS256' });
    await expect(signer.verify(staff)).rejects.toBeDefined();
  });

  it('the service strategy accepts a service payload, rejects human / super-role / wrong-scope payloads', () => {
    expect(strategy.validate({ sub: 'sp', labId: 'l', scope: 'service', type: 'access', permissions: ['a:b'] } as any)).toMatchObject({ kind: 'service', servicePrincipalId: 'sp', isSuperRole: false, permissions: ['a:b'] });
    expect(() => strategy.validate({ sub: 'sp', labId: 'l', scope: 'staff', type: 'access' } as any)).toThrow();
    expect(() => strategy.validate({ sub: 'sp', labId: 'l', scope: 'service', type: 'access', isSuperRole: true } as any)).toThrow();
    expect(() => strategy.validate({ scope: 'service', type: 'access' } as any)).toThrow(); // no sub/labId
  });

  it('a SERVICE principal’s token permissions terminate at the EXISTING PermissionsGuard', () => {
    const guard = new PermissionsGuard(new Reflector());
    const handler = () => undefined;
    Reflect.defineMetadata(PERMISSIONS_KEY, ['record:view'], handler);
    const ctx = (user: unknown): ExecutionContext => ({ getHandler: () => handler, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any);
    // service principal WITH the scope → allowed; WITHOUT → denied; isSuperRole is always false for services
    expect(guard.canActivate(ctx({ kind: 'service', permissions: ['record:view'], isSuperRole: false }))).toBe(true);
    expect(() => guard.canActivate(ctx({ kind: 'service', permissions: ['other:view'], isSuperRole: false }))).toThrow(ForbiddenException);
  });
});
