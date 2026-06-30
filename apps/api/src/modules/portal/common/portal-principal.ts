import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * Portal JWT claims. Separate secret + `aud: 'portal'` + `scope: 'portal'` from
 * the staff token, so the two token families are mutually unverifiable.
 */
export interface PortalJwtPayload {
  sub: string; // portalUserId
  labId: string;
  clientId: string;
  email: string;
  type: 'access' | 'refresh';
  scope: 'portal';
}

/** Authenticated external principal, attached to request.user on portal routes. */
export interface PortalPrincipal {
  kind: 'portal';
  portalUserId: string;
  labId: string;
  clientId: string;
  email: string;
}

export const PORTAL_AUDIENCE = 'portal';
export const STAFF_AUDIENCE = 'staff';

/**
 * Marks a route/controller as belonging to the client portal. The global staff
 * JwtAuthGuard stands down for these routes so the controller's PortalAuthGuard
 * (the portal JWT strategy) authenticates instead.
 */
export const IS_PORTAL_KEY = 'isPortal';
export const Portal = () => SetMetadata(IS_PORTAL_KEY, true);

/** Injects the authenticated portal principal (request.user on portal routes). */
export const CurrentPortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalPrincipal =>
    ctx.switchToHttp().getRequest().user,
);
