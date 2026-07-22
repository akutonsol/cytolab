import { Body, Controller, Delete, Get, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthorizationContract } from '../../common/decorators/authorization-contract.decorator';
import { LabService } from './lab.service';
import { UpdateLabProfileDto } from './dto/lab.dto';

/**
 * Company profile (Settings > General > Company). Lab-scoped branding + contact
 * details; gated on the same application-preferences permission as the other
 * Settings > General panes.
 */
@ApiTags('lab')
@ApiBearerAuth()
@Controller('lab')
export class LabController {
  constructor(private lab: LabService) {}

  // Auth-only: the dashboard shell brands itself with this for every staff user,
  // not just those who can edit company settings. Returns identity fields only.
  @Get('branding')
  @AuthorizationContract('authenticated')
  getBranding() {
    return this.lab.getBranding();
  }

  @Get('profile')
  @RequirePermissions('applicationprefs:view')
  getProfile() {
    return this.lab.getProfile();
  }

  @Put('profile')
  @RequirePermissions('applicationprefs:change')
  updateProfile(@Body() dto: UpdateLabProfileDto) {
    return this.lab.updateProfile(dto);
  }

  @Post('logo')
  @RequirePermissions('applicationprefs:change')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return this.lab.uploadLogo(file);
  }

  @Delete('logo')
  @RequirePermissions('applicationprefs:change')
  removeLogo() {
    return this.lab.removeLogo();
  }
}
