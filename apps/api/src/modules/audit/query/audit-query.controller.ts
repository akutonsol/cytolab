import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditQueryService } from './audit-query.service';
import { AuditReaderPrincipal, RequestedAuditScope } from './audit-query.types';
import { RawAuditQueryFilters } from './audit-query.filters';
import { AUDIT_READ } from './audit-query.permissions';
import { ListAuditEventsQueryDto, GetAuditEventQueryDto } from './dto/audit-query.dto';

/**
 * Program 2 · P2-7B — READ-ONLY Audit Query API (GET only). The coarse route gate requires audit:read
 * (the locked base gate for EVERY reader); the owner service additionally enforces audit:read_system
 * (SYSTEM/CROSS_LAB) and audit:read_phi (PHI) per request. The controller only validates transport,
 * extracts the TRUSTED principal, and maps to the frozen request model — it builds no Prisma
 * predicate, performs no projection/redaction, and never reads the ledger directly.
 */
@ApiTags('audit')
@ApiBearerAuth()
@RequirePermissions(AUDIT_READ)
@Controller('audit')
export class AuditQueryController {
  constructor(private readonly query: AuditQueryService) {}

  private principal(user: AuthUser): AuditReaderPrincipal {
    // Identity/authz come ONLY from the trusted authenticated principal, never from query params.
    return { labId: user.labId, permissions: user.permissions ?? [], isSuperRole: user.isSuperRole === true };
  }

  private splitCsv(v?: string): string[] | undefined {
    if (!v) return undefined;
    const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : undefined;
  }

  private mapScope(dto: ListAuditEventsQueryDto): RequestedAuditScope | undefined {
    if (!dto.scope) return undefined;
    const kind = dto.scope === 'lab' ? 'LAB' : dto.scope === 'system' ? 'SYSTEM' : 'CROSS_LAB';
    return { scope: kind, labIds: this.splitCsv(dto.labIds) };
  }

  @Get('events')
  @ApiOperation({ summary: 'List audit events (governed, cursor-paginated, read-only)' })
  async list(@Query() dto: ListAuditEventsQueryDto, @CurrentUser() user: AuthUser) {
    const filters: RawAuditQueryFilters = {
      timeFrom: dto.timeFrom,
      timeTo: dto.timeTo,
      category: this.splitCsv(dto.category) as any,
      actionCode: this.splitCsv(dto.actionCode),
      actorType: dto.actorType as any,
      actorId: dto.actorId,
      resourceType: dto.resourceType,
      resourceId: dto.resourceId,
      outcome: dto.outcome as any,
      correlationId: dto.correlationId,
      pageSize: dto.pageSize,
    };
    return this.query.list({
      principal: this.principal(user),
      requestedScope: this.mapScope(dto),
      filters,
      cursor: dto.cursor,
      phi: dto.includePhi === 'true',
    });
  }

  @Get('events/:id')
  @ApiOperation({ summary: 'Get one audit event (same scope + PHI policy; inaccessible === not found)' })
  async getById(@Param('id') id: string, @Query() dto: GetAuditEventQueryDto, @CurrentUser() user: AuthUser) {
    const event = await this.query.getById({ principal: this.principal(user), id, phi: dto.includePhi === 'true' });
    if (!event) throw new NotFoundException('Audit event not found');
    return event;
  }
}
