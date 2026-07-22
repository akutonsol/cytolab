import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SlideIngestionService } from './slide-ingestion.service';
import { CompleteSlideUploadDto, InitiateSlideUploadDto } from './dto/slide-ingestion.dto';

/** Max bytes accepted in a single upload chunk (bounded so the API never buffers a whole slide). */
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi')
export class SlideIngestionController {
  constructor(private readonly ingestion: SlideIngestionService) {}

  // Slide uploads gate on record:change (consistent with slide creation). @RequireFeature enforcement
  // is deferred to a later, explicitly-scoped checkpoint.
  @Post('records/:recordId/slide-uploads')
  @RequirePermissions('record:change')
  initiate(
    @CurrentUser() user: AuthUser,
    @Param('recordId') recordId: string,
    @Body() dto: InitiateSlideUploadDto,
  ) {
    return this.ingestion.initiate(recordId, dto, user?.userId ?? null);
  }

  @Post('slide-ingestions/:id/chunks')
  @RequirePermissions('record:change')
  async appendChunk(
    @Param('id') id: string,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
    @Req() req: Request,
  ) {
    const chunk = await readBoundedBody(req, MAX_CHUNK_BYTES);
    return this.ingestion.appendChunk(id, offset, chunk);
  }

  @Post('slide-ingestions/:id/complete')
  @RequirePermissions('record:change')
  complete(@Param('id') id: string, @Body() dto: CompleteSlideUploadDto) {
    return this.ingestion.complete(id, dto);
  }

  @Get('slide-ingestions/:id')
  @RequirePermissions('record:view')
  get(@Param('id') id: string) {
    return this.ingestion.get(id);
  }
}

/** Collect a raw request body into a Buffer, rejecting anything larger than `maxBytes`. Streaming — the
 *  guard is per-chunk, so total memory is bounded by MAX_CHUNK_BYTES, never a whole slide. */
function readBoundedBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (d: Buffer) => {
      total += d.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new BadRequestException(`upload chunk exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
