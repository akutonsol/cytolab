import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CanonicalPrincipal, humanPrincipal } from './canonical-principal';

/**
 * Program 7 · Phase 7A.1 — durable linkage from an external federated subject to an internal human principal. INERT in
 * 7A.1: provided for the 7A.2/7A.3 adapters to write on first federated login and read on subsequent logins. The
 * linkage binds to the STABLE internal principal (`User.id`, GG7), never to the mutable external subject; a resolved
 * link yields a human canonical principal. Lab-scoped; provisioning/JIT (D5) is Phase 7B. This is not domain truth
 * (Principle 10).
 */
@Injectable()
export class FederatedIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  link(identityProviderId: string, externalSubject: string, userId: string) {
    return this.prisma.federatedIdentity.create({
      data: tenantCreate<Prisma.FederatedIdentityUncheckedCreateInput>({ identityProviderId, externalSubject, userId }),
    });
  }

  /** Resolve a (provider, external subject) to the linked human canonical principal, or null if unlinked. */
  async resolve(identityProviderId: string, externalSubject: string): Promise<CanonicalPrincipal | null> {
    const link = await this.prisma.federatedIdentity.findFirst({
      where: { identityProviderId, externalSubject },
      select: { userId: true, labId: true },
    });
    return link ? humanPrincipal(link.userId, link.labId) : null;
  }

  listForProvider(identityProviderId: string) {
    return this.prisma.federatedIdentity.findMany({ where: { identityProviderId }, orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const link = await this.prisma.federatedIdentity.findFirst({ where: { id } });
    if (!link) throw new NotFoundException('federated identity not found');
    return link;
  }
}
