import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WsiService } from './wsi.service';
import { CreateAnnotationDto, UpdateAnnotationDto } from './dto/wsi.dto';
import { ListSlidesQueryDto } from './dto/list-slides-query.dto';

@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi')
export class WsiController {
  constructor(private readonly wsi: WsiService) {}

  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: ListSlidesQueryDto) {
    return this.wsi.list(query);
  }

  @Get('summary')
  @RequirePermissions('record:view')
  summary() {
    return this.wsi.summary();
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  byRecord(@Param('recordId') recordId: string) {
    return this.wsi.getByRecord(recordId);
  }

  // P5-4 Phase B Part 2: the legacy paste-URL creation endpoint (POST record/:recordId) was retired.
  // Slides are created only through the authenticated ingestion pipeline (POST records/:recordId/slide-uploads).
  // The GET record/:recordId read endpoint above is preserved.

  @Post(':slideId/annotations')
  @RequirePermissions('record:change')
  addAnnotation(@CurrentUser() user: AuthUser, @Param('slideId') slideId: string, @Body() dto: CreateAnnotationDto) {
    return this.wsi.addAnnotation(slideId, dto, user.userId);
  }

  @Patch('annotations/:annotationId')
  @RequirePermissions('record:change')
  updateAnnotation(@Param('annotationId') annotationId: string, @Body() dto: UpdateAnnotationDto) {
    return this.wsi.updateAnnotation(annotationId, dto);
  }

  @Delete('annotations/:annotationId')
  @RequirePermissions('record:change')
  removeAnnotation(@Param('annotationId') annotationId: string) {
    return this.wsi.removeAnnotation(annotationId);
  }

  @Get(':slideId')
  @RequirePermissions('record:view')
  detail(@Param('slideId') slideId: string) {
    return this.wsi.detail(slideId);
  }

  @Delete(':slideId')
  @RequirePermissions('record:change')
  remove(@Param('slideId') slideId: string) {
    return this.wsi.remove(slideId);
  }
}
