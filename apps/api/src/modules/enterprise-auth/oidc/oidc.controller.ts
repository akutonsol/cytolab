import { BadRequestException, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { LabContext } from '../../../common/tenancy/lab-context';
import { PrismaService } from '../../../database/prisma.service';
import { OidcService } from './oidc.service';

/**
 * Program 7 · Phase 7A.2a — the interactive OIDC login routes. `@Public` (a login flow — no JWT yet) and throttled, in
 * the spirit of the existing password-login route; the transaction's state/nonce/PKCE + config-immutability provide the
 * protection. `initiate` resolves the lab from the request host (`LabDomain`) — routing selects a provider, it never
 * derives or changes `labId` isolation (ET3). `callback` resolves the lab from the transaction's own `state`. Session
 * establishment reuses the existing path (no parallel session). No authorization decision is made here.
 */
@ApiTags('enterprise-auth-oidc')
@Controller('enterprise-auth/oidc')
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':providerKey/initiate')
  async initiate(@Param('providerKey') providerKey: string, @Req() req: Request) {
    const labId = await this.labFromHost(req);
    return this.labContext.runLabScoped(labId, () => this.oidc.initiate(providerKey));
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('callback')
  async callback(@Query('state') state: string, @Query('code') code: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!state || !code) throw new BadRequestException('missing state or code');
    const labId = await this.labFromTransactionState(state);
    return this.labContext.runLabScoped(labId, () => this.oidc.complete(state, code, req, res));
  }

  /** Resolve the lab from the request host via LabDomain (system-scoped lookup). Never changes labId isolation. */
  private async labFromHost(req: Request): Promise<string> {
    const hostname = String(req.headers.host ?? '').toLowerCase().split(':')[0];
    if (!hostname) throw new BadRequestException('unknown host');
    const domain = await this.labContext.runSystem(() => this.prisma.labDomain.findFirst({ where: { hostname }, select: { labId: true } }));
    if (!domain) throw new BadRequestException('no lab is mapped to this host');
    return domain.labId;
  }

  /** Resolve the lab from the transaction bound to this state (state is a single-use, high-entropy token). */
  private async labFromTransactionState(state: string): Promise<string> {
    const tx = await this.labContext.runSystem(() => this.prisma.oidcAuthTransaction.findFirst({ where: { state }, select: { labId: true } }));
    if (!tx) throw new BadRequestException('unknown or invalid OIDC state');
    return tx.labId;
  }
}
