import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  // Upload a file (optionally attaching it to a record). 10MB cap enforced in
  // the service alongside the allowed-type check.
  @Post('upload')
  @RequirePermissions('record:change')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: Express.Multer.File, @Query('recordId') recordId?: string) {
    return this.files.upload(file, recordId || undefined);
  }

  @Get()
  @RequirePermissions('record:view')
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: string,
  ) {
    return this.files.findAll({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      kind: kind || undefined,
    });
  }

  @Get('stats')
  @RequirePermissions('record:view')
  getStats() {
    return this.files.getStats();
  }

  @Get('record/:recordId')
  @RequirePermissions('record:view')
  getRecordAttachments(@Param('recordId') recordId: string) {
    return this.files.getRecordAttachments(recordId);
  }

  @Delete(':id')
  @RequirePermissions('record:change')
  deleteAttachment(@Param('id') id: string) {
    return this.files.deleteAttachment(id);
  }
}
