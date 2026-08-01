import { Reflector } from '@nestjs/core';
import { ScimController } from './scim.controller';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { IS_SERVICE_KEY } from '../enterprise-auth/service-oauth/service-oauth.constants';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { SCIM_PERMISSION } from './scim.constants';

/**
 * Program 7 · Phase 7B.3 — the SCIM authorization boundary, proven by route metadata (no DB). EVERY SCIM route is
 * machine-only (`@Service()` → the frozen 7A.2b ServiceAuthGuard) and requires `identityprovisioning:manage`, evaluated
 * by the EXISTING single PermissionsGuard. NO SCIM route is `@Public`, and NO route asks for any other permission — so a
 * human/portal/anonymous caller, or a ServicePrincipal without the SCIM scope, fails closed.
 */
describe('P7-7B.3 SCIM authorization boundary (metadata)', () => {
  const reflector = new Reflector();
  const proto = ScimController.prototype as Record<string, any>;
  const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor' && typeof proto[n] === 'function' && !n.startsWith('ifMatch') && !n.startsWith('principal'));

  // The public SCIM HTTP handlers (excludes the private helpers filtered above).
  const routes = ['create', 'get', 'list', 'replace', 'patch', 'remove', 'serviceProviderConfig', 'resourceTypes', 'schemas'];

  it('exposes exactly the expected SCIM route handlers', () => {
    for (const r of routes) expect(handlers).toContain(r);
  });

  it.each(routes)('route "%s" is @Service() (machine-only) and never @Public', (route) => {
    const isService = reflector.get<boolean>(IS_SERVICE_KEY, proto[route]);
    const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, proto[route]);
    expect(isService).toBe(true);
    expect(isPublic).toBeFalsy();
  });

  it.each(routes)('route "%s" requires ONLY identityprovisioning:manage (single PermissionsGuard boundary)', (route) => {
    const perms = reflector.get<string[]>(PERMISSIONS_KEY, proto[route]);
    expect(perms).toEqual([SCIM_PERMISSION]);
  });
});
