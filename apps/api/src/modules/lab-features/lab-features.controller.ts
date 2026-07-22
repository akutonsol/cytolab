import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { SuperuserGuard } from '../auth/guards/superuser.guard';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { LabFeaturesService } from './lab-features.service';
import { ToggleFeatureDto } from './dto/lab-features.dto';

@ApiTags('lab-features')
@ApiBearerAuth()
@Controller('lab-features')
export class LabFeaturesController {
  constructor(private readonly features: LabFeaturesService) {}

  /**
   * Enabled feature keys for the caller's lab. Any authenticated staff user may
   * read this (it drives UI gating for every role) — no permission required, but
   * still authenticated so the tenancy layer knows which lab to scope to.
   */
  @Get('enabled')
  @AuthorizationContract('authenticated')
  enabled() {
    return this.features.enabledForLab();
  }

  // ── Superuser-only management surface ──────────────────────────────

  @Get()
  @UseGuards(SuperuserGuard)
  list() {
    return this.features.listForLab();
  }

  @Get('all-labs')
  @UseGuards(SuperuserGuard)
  allLabs() {
    return this.features.listAllLabs();
  }

  @Patch(':featureKey')
  @UseGuards(SuperuserGuard)
  toggle(
    @CurrentUser() user: AuthUser,
    @Param('featureKey') featureKey: string,
    @Body() dto: ToggleFeatureDto,
  ) {
    return this.features.toggle(featureKey, dto, user.userId);
  }
}
