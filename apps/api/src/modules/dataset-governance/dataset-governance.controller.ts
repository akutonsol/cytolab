import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { DatasetGovernanceService } from './dataset-governance.service';
import { CreateDatasetDto, UpdateDatasetDto, CreateDatasetVersionDto, AddDatasetSlideDto, SetGroundTruthLabelDto, AddTrainingReferenceDto } from './dto/dataset-governance.dto';

/**
 * Program 6 · Phase 6B — dataset governance API. Lab scope comes from the JWT principal (never the body).
 * Authorization: `dataset:view` (read), `dataset:manage` (create/edit DRAFT membership/labels/rules + training
 * references), `dataset:freeze` (freeze a version — the immutability commit). None granted to a default role.
 * No inference/training/model-linkage/validation endpoints here.
 */
@ApiTags('ai-dataset-governance')
@ApiBearerAuth()
@Controller('ai/datasets')
export class DatasetGovernanceController {
  constructor(private readonly svc: DatasetGovernanceService) {}

  @Post()
  @RequirePermissions('dataset:manage')
  createDataset(@CurrentUser() user: AuthUser, @Body() dto: CreateDatasetDto) {
    return this.svc.createDataset(dto, user.userId);
  }

  @Get()
  @RequirePermissions('dataset:view')
  listDatasets() {
    return this.svc.listDatasets();
  }

  @Get(':id')
  @RequirePermissions('dataset:view')
  getDataset(@Param('id') id: string) {
    return this.svc.getDataset(id);
  }

  @Patch(':id')
  @RequirePermissions('dataset:manage')
  updateDataset(@Param('id') id: string, @Body() dto: UpdateDatasetDto) {
    return this.svc.updateDataset(id, dto);
  }

  @Post(':id/versions')
  @RequirePermissions('dataset:manage')
  createVersion(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateDatasetVersionDto) {
    return this.svc.createVersion(id, dto, user.userId);
  }

  @Get('versions/:versionId')
  @RequirePermissions('dataset:view')
  getVersion(@Param('versionId') versionId: string) {
    return this.svc.getVersion(versionId);
  }

  @Post('versions/:versionId/slides')
  @RequirePermissions('dataset:manage')
  addSlide(@Param('versionId') versionId: string, @Body() dto: AddDatasetSlideDto) {
    return this.svc.addSlide(versionId, dto);
  }

  @Post('versions/:versionId/labels')
  @RequirePermissions('dataset:manage')
  setLabel(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string, @Body() dto: SetGroundTruthLabelDto) {
    return this.svc.setLabel(versionId, dto, user.userId);
  }

  @Post('versions/:versionId/freeze')
  @RequirePermissions('dataset:freeze')
  freezeVersion(@CurrentUser() user: AuthUser, @Param('versionId') versionId: string) {
    return this.svc.freezeVersion(versionId, user.userId);
  }

  @Post(':id/training-references')
  @RequirePermissions('dataset:manage')
  addTrainingReference(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddTrainingReferenceDto) {
    return this.svc.addTrainingReference(id, dto, user.userId);
  }
}
