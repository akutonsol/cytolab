import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { tenantCreate } from '../../../common/tenancy/tenancy.extension';

/**
 * Program 7 · Phase 7A.2b — service-principal scopes (D5). A scope is an EXISTING catalogue `Permission` grant — one
 * authorization vocabulary, enforced by the single existing `PermissionsGuard`. No second scope language. `isSuperRole`
 * never applies to a service principal, so its effective authority is EXACTLY its assigned permission codes.
 */
@Injectable()
export class ServicePrincipalScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async assign(servicePrincipalId: string, permissionCode: string, actorId?: string | null) {
    const sp = await this.prisma.servicePrincipal.findFirst({ where: { id: servicePrincipalId }, select: { id: true } });
    if (!sp) throw new NotFoundException('service principal not found');
    const permission = await this.prisma.permission.findFirst({ where: { code: permissionCode }, select: { id: true } });
    if (!permission) throw new BadRequestException('unknown permission code');
    return this.prisma.servicePrincipalScope.create({ data: tenantCreate<Prisma.ServicePrincipalScopeUncheckedCreateInput>({ servicePrincipalId, permissionId: permission.id, createdById: actorId ?? null }) });
  }

  async revokeScope(scopeId: string) {
    const scope = await this.prisma.servicePrincipalScope.findFirst({ where: { id: scopeId }, select: { id: true } });
    if (!scope) throw new NotFoundException('scope grant not found');
    return this.prisma.servicePrincipalScope.delete({ where: { id: scope.id } });
  }

  list(servicePrincipalId: string) {
    return this.prisma.servicePrincipalScope.findMany({ where: { servicePrincipalId }, include: { permission: { select: { code: true } } }, orderBy: { createdAt: 'asc' } });
  }

  /** The effective permission codes granted to a service principal (its full authority; no super-role, ever). */
  async effectivePermissions(servicePrincipalId: string): Promise<string[]> {
    const scopes = await this.prisma.servicePrincipalScope.findMany({ where: { servicePrincipalId }, select: { permission: { select: { code: true } } } });
    return [...new Set(scopes.map((s) => s.permission.code))];
  }
}
