import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateServicePrincipalDto } from './dto/enterprise-auth.dto';
import { CanonicalPrincipal, servicePrincipal } from './canonical-principal';

/**
 * Program 7 · Phase 7A.1 — the NON-HUMAN principal class (Principle 11). A service principal is a machine identity,
 * structurally distinct from a human `User`; it can NEVER hold clinical/diagnostic/sign-out/AI-approval authority
 * (ET5/ET6). Lab-scoped (context, never the body). The machine-auth (client-credentials) runtime lands with 7A.2;
 * 7A.1 establishes the entity, its stable identifier (GG7), and its resolution to a canonical (service) principal.
 */
@Injectable()
export class ServicePrincipalService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateServicePrincipalDto, actorId?: string | null) {
    return this.prisma.servicePrincipal.create({
      data: tenantCreate<Prisma.ServicePrincipalUncheckedCreateInput>({
        key: dto.key,
        displayName: dto.displayName,
        isActive: true,
        createdById: actorId ?? null,
      }),
    });
  }

  list() {
    return this.prisma.servicePrincipal.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    const sp = await this.prisma.servicePrincipal.findFirst({ where: { id } });
    if (!sp) throw new NotFoundException('service principal not found');
    return sp;
  }

  async deactivate(id: string) {
    const sp = await this.get(id);
    if (!sp.isActive) throw new BadRequestException('service principal is already inactive');
    return this.prisma.servicePrincipal.update({ where: { id: sp.id }, data: { isActive: false } });
  }

  /** Resolve an ACTIVE service principal to a canonical (non-human) principal. */
  async toCanonicalPrincipal(id: string): Promise<CanonicalPrincipal> {
    const sp = await this.get(id);
    if (!sp.isActive) throw new BadRequestException('service principal is inactive');
    return servicePrincipal(sp.id, sp.labId);
  }
}
