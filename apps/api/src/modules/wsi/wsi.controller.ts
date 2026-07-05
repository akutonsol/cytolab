import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { WsiService } from './wsi.service';
import { CreateAnnotationDto, CreateSlideDto, UpdateAnnotationDto } from './dto/wsi.dto';

@ApiTags('wsi')
@ApiBearerAuth()
@Controller('wsi')
export class WsiController {
  constructor(private readonly wsi: WsiService) {}

  @Get()
  @RequirePermissions('record:view')
  list() {
    return this.wsi.list();
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

  @Post('record/:recordId')
  @RequirePermissions('record:change')
  createSlide(@CurrentUser() user: AuthUser, @Param('recordId') recordId: string, @Body() dto: CreateSlideDto) {
    return this.wsi.createSlide(recordId, dto, user.userId);
  }

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
