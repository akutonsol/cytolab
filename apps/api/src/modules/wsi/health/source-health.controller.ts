import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { SourceHealthService } from './source-health.service';

class CheckHealthDto {
  /** Check one source; omit to check all enabled sources in the authenticated lab. */
  @IsOptional() @IsString() @MaxLength(64)
  sourceId?: string;
}

/**
 * Program 5C · C5 — manual source-health execution. Gated by `system:ingestion` (operational health action).
 * Tenant-scoped; synchronous with a bounded per-check timeout. Returns structured, non-secret snapshots only —
 * never an endpoint URL, credential, rootPath, or raw error. A manual check is always audited.
 */
@ApiTags('wsi-ingestion-health')
@ApiBearerAuth()
@Controller('wsi/ingestion/health')
export class SourceHealthController {
  constructor(private readonly health: SourceHealthService) {}

  @Post('check')
  @RequirePermissions('system:ingestion')
  check(@Body() dto: CheckHealthDto) {
    return dto.sourceId ? this.health.checkSource(dto.sourceId, { manual: true }) : this.health.checkLab();
  }
}
