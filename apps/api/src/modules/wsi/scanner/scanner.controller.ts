import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { IngestionSourceService } from '../auto-ingestion/ingestion-source.service';
import { ScannerRouterService } from './scanner-router.service';

class CreateScannerSourceDto {
  @IsString() @MinLength(1) @MaxLength(2048)
  rootPath!: string;

  @IsIn(['FILESYSTEM_IMAGE', 'FILESYSTEM_DICOM'])
  adapterType!: 'FILESYSTEM_IMAGE' | 'FILESYSTEM_DICOM';
}

/**
 * Program 5C · C4 — scanner-adapter administration + on-demand run. Gated by the existing `system:ingestion`
 * authority (ingestion-source config + import execution) — no new permission. Running an adapter routes each
 * completed scan through the accepted intake; it never creates a second pipeline/worker/slide/publication path.
 */
@ApiTags('wsi-scanner')
@ApiBearerAuth()
@Controller('wsi/scanner')
export class ScannerController {
  constructor(
    private readonly sources: IngestionSourceService,
    private readonly router: ScannerRouterService,
  ) {}

  /** Register a FILESYSTEM scanner source with an adapter (FILESYSTEM_IMAGE | FILESYSTEM_DICOM). */
  @Post('sources')
  @RequirePermissions('system:ingestion')
  createSource(@Body() dto: CreateScannerSourceDto) {
    return this.sources.create({ rootPath: dto.rootPath, adapterType: dto.adapterType });
  }

  /** Run the configured adapter for a source, ingesting each completed scan via the accepted pipeline. */
  @Post('sources/:id/scan')
  @RequirePermissions('system:ingestion')
  scan(@Param('id') id: string) {
    return this.router.runSource(id);
  }
}
