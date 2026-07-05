import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { LoginProtectionService } from './login-protection.service';
import { getClientIp } from './request-context.util';

/**
 * Global IP denylist guard — rejects requests from blocked IPs before any
 * handler runs. Runs on every request (including public ones), so a blocked IP
 * can't even reach the login endpoint.
 *
 * A short in-memory cache keeps this off the hot path: the vast majority of IPs
 * aren't blocked, so we memoise "allowed" for a few seconds rather than hitting
 * the DB on every request.
 */
@Injectable()
export class IpBlockGuard implements CanActivate {
  private readonly cache = new Map<string, { blocked: boolean; expires: number }>();
  private static readonly TTL_MS = 30_000;

  constructor(private loginProtection: LoginProtectionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(req);

    const cached = this.cache.get(ip);
    const now = Date.now();
    if (cached && cached.expires > now) {
      if (cached.blocked) throw new ForbiddenException('Access denied');
      return true;
    }

    const blocked = await this.loginProtection.isIpBlocked(ip);
    this.cache.set(ip, { blocked, expires: now + IpBlockGuard.TTL_MS });
    if (blocked) throw new ForbiddenException('Access denied');
    return true;
  }
}
