import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RegisterIdentityProviderDto } from './dto/enterprise-auth.dto';

/**
 * Program 7 · Phase 7A.1 — per-lab enterprise identity-provider CONFIGURATION (administrative; never a tenancy key —
 * Principle 4 / ET3). Lab scope comes from the tenancy context (never the request body). INERT in 7A.1: registering a
 * provider records configuration only; no federated login flow activates until an adapter ships (7A.2/7A.3). Provider
 * config is not domain truth (Principle 10).
 */
@Injectable()
export class IdentityProviderService {
  constructor(private readonly prisma: PrismaService) {}

  register(dto: RegisterIdentityProviderDto, actorId?: string | null) {
    return this.prisma.identityProvider.create({
      data: tenantCreate<Prisma.IdentityProviderUncheckedCreateInput>({
        key: dto.key,
        displayName: dto.displayName,
        protocol: dto.protocol,
        issuer: dto.issuer ?? null,
        isEnabled: false, // inert until an adapter activates it
        createdById: actorId ?? null,
      }),
    });
  }

  list() {
    return this.prisma.identityProvider.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const provider = await this.prisma.identityProvider.findFirst({ where: { id } });
    if (!provider) throw new NotFoundException('identity provider not found');
    return provider;
  }
}
