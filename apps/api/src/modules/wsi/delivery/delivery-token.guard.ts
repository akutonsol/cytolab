import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { DeliverySessionService, ValidatedCapability } from './delivery-session.service';

/** Request property the guard attaches the redeemed capability to (read via `@DeliveryCapability()`). */
export const DELIVERY_CAPABILITY_KEY = '__deliveryCapability';

/**
 * P5-5B-i — the delivery-capability credential boundary. Consumes ONLY the `Authorization: Bearer` header
 * (never a query param, cookie, route token, or URL fragment), redeems it via the DB-authoritative
 * DeliverySessionService, and attaches the ValidatedCapability to the request. Every redemption failure
 * (missing / malformed / unknown / expired / revoked / binding) collapses to a single GENERIC 401 — the
 * external response never reveals which, and the token is never logged or echoed.
 */
@Injectable()
export class DeliveryTokenGuard implements CanActivate {
  constructor(private readonly sessions: DeliverySessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(req);
    if (!token) throw new UnauthorizedException('delivery authorization required');

    let capability: ValidatedCapability;
    try {
      capability = await this.sessions.redeem(token);
    } catch {
      throw new UnauthorizedException('invalid delivery authorization'); // generic — no distinction, no token
    }
    (req as unknown as Record<string, unknown>)[DELIVERY_CAPABILITY_KEY] = capability;
    return true;
  }
}

/** ONLY `Authorization: Bearer <token>` (scheme case-insensitive). Query/cookie/other transports are ignored. */
function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const m = /^Bearer[ ]+(\S.*)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}
