import { BadRequestException, Body, Controller, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { LabContext } from '../../../common/tenancy/lab-context';
import { PrismaService } from '../../../database/prisma.service';
import { SamlService } from './saml.service';
import { SamlAcsDto } from './dto/saml.dto';

/**
 * Program 7 · Phase 7A.3 — SP-initiated SAML login routes (the OidcController analogue). `@Public` (a login flow — no
 * JWT yet) and throttled, in the spirit of the existing password-login route; the persisted request + config-fingerprint
 * + signed-assertion validation provide the protection. Both routes resolve the lab from the request host (`LabDomain`)
 * — routing selects a provider, it never derives or changes `labId` isolation (ET3). The IdP-supplied `InResponseTo`
 * (validated inside the signed response) is matched to the persisted request at consume-time; the trust anchor is chosen
 * from the (host, providerKey) config BEFORE any message content is trusted. No authorization decision is made here.
 */
@ApiTags('enterprise-auth-saml')
@Controller('enterprise-auth/saml')
export class SamlController {
  constructor(
    private readonly saml: SamlService,
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':providerKey/initiate')
  async initiate(@Param('providerKey') providerKey: string, @Req() req: Request) {
    const labId = await this.labFromHost(req);
    return this.labContext.runLabScoped(labId, () => this.saml.initiate(providerKey));
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post(':providerKey/acs')
  async acs(@Param('providerKey') providerKey: string, @Body() body: SamlAcsDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const labId = await this.labFromHost(req);
    return this.labContext.runLabScoped(labId, () => this.saml.complete(providerKey, body.SAMLResponse, body.RelayState, req, res));
  }

  /** Resolve the lab from the request host via LabDomain (system-scoped lookup). Never changes labId isolation (ET3). */
  private async labFromHost(req: Request): Promise<string> {
    const hostname = String(req.headers.host ?? '').toLowerCase().split(':')[0];
    if (!hostname) throw new BadRequestException('unknown host');
    const domain = await this.labContext.runSystem(() => this.prisma.labDomain.findFirst({ where: { hostname }, select: { labId: true } }));
    if (!domain) throw new BadRequestException('no lab is mapped to this host');
    return domain.labId;
  }
}
