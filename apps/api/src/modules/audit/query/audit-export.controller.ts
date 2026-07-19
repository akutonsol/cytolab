import { Body, Controller, HttpCode, Post, Res, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuditReaderPrincipal } from './audit-query.types';
import { AUDIT_READ } from './audit-query.permissions';
import { AuditExportCoordinator } from './audit-export.coordinator';
import { ExportAuditEventsBodyDto, parseAuditExportRequest } from './dto/audit-export.dto';

/**
 * Program 2 · P2-9A — governed Audit Log export endpoint. This is a governed EGRESS boundary, NOT a
 * second query implementation: it validates transport, extracts the TRUSTED principal, and delegates
 * everything else to the AuditExportCoordinator (assemble via the frozen AuditQueryService → serialize
 * the certified projection → capture transactionally → hand back a resolved artifact). It builds no
 * predicate, reads no ledger, and — critically — writes NO response byte until the coordinator returns,
 * which only happens after the DATA_EXPORT:AUDIT_EXPORTED capture commits (capture-before-egress).
 *
 * The coarse route gate is audit:read (the base gate for every reader); the service additionally
 * enforces audit:read_system (SYSTEM/CROSS_LAB) and audit:read_phi (projection=phi) per request, so
 * export authority can never exceed interactive read authority. A denial (403), a bad request (400),
 * or a capture failure (generic 500) all propagate with zero export bytes emitted.
 */
@ApiTags('audit')
@ApiBearerAuth()
@RequirePermissions(AUDIT_READ)
@Controller('audit')
export class AuditExportController {
  constructor(private readonly coordinator: AuditExportCoordinator) {}

  private principal(user: AuthUser): AuditReaderPrincipal {
    return { labId: user.labId, permissions: user.permissions ?? [], isSuperRole: user.isSuperRole === true };
  }

  @Post('events/export')
  @HttpCode(200)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  @ApiOperation({ summary: 'Export audit events (governed egress; CSV/NDJSON of the certified projection)' })
  async export(
    @Body() dto: ExportAuditEventsBodyDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const parsed = parseAuditExportRequest(dto);
    // Throws (403 / 400 / generic 500) BEFORE returning if authorization, assembly, or capture fails —
    // no header is set and no byte is written in that case.
    const artifact = await this.coordinator.export({
      principal: this.principal(user),
      requestedScope: parsed.requestedScope,
      filters: parsed.filters,
      projection: parsed.projection,
      format: parsed.format,
      cap: parsed.cap,
    });

    res.set('Content-Type', artifact.contentType);
    res.set('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    res.set('Cache-Control', artifact.cacheControl); // no-store for ALL audit exports (incl. PHI)
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('X-Audit-Export-Truncated', String(artifact.truncated)); // non-sensitive assembly signal
    return artifact.body;
  }
}
