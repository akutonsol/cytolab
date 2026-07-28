import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { DicomWebSourceService } from './dicomweb-source.service';
import { DicomWebImportService } from './dicomweb-import.service';
import { CreateDicomWebSourceDto, DiscoverQueryDto, ImportSeriesDto } from './dto/dicomweb.dto';

/**
 * Program 5C · C3 — DICOMweb endpoint administration + remote import execution. EVERY route requires the new
 * `system:ingestion` authority (infrastructure-sensitive: endpoint URLs + encrypted credentials + outbound
 * requests) — never wsi:view/record/reconcile. Import routes native bytes through the accepted C2 pipeline;
 * this controller never delivers tiles/frames, never publishes, and never returns a credential.
 */
@ApiTags('wsi-dicomweb')
@ApiBearerAuth()
@Controller('wsi/dicomweb')
export class DicomWebController {
  constructor(
    private readonly sources: DicomWebSourceService,
    private readonly imports: DicomWebImportService,
  ) {}

  // ── Endpoint administration ──
  @Post('sources')
  @RequirePermissions('system:ingestion')
  createSource(@Body() dto: CreateDicomWebSourceDto) {
    return this.sources.create(dto);
  }

  @Get('sources')
  @RequirePermissions('system:ingestion')
  listSources() {
    return this.sources.list();
  }

  @Patch('sources/:id/enabled')
  @RequirePermissions('system:ingestion')
  setEnabled(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.sources.setEnabled(id, body.enabled === true);
  }

  // ── QIDO discovery (structured summaries only — never raw DICOM JSON) ──
  @Get('discover')
  @RequirePermissions('system:ingestion')
  discover(@Query() q: DiscoverQueryDto) {
    return this.imports.discoverSeries(q);
  }

  // ── Import execution ──
  @Post('import')
  @RequirePermissions('system:ingestion')
  import(@Body() dto: ImportSeriesDto) {
    return this.imports.importSeries(dto);
  }
}
