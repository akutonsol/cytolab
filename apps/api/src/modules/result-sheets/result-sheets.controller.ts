import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResultSheetsService } from './result-sheets.service';
import {
  CreateResultSheetDto,
  ResultSheetQueryDto,
  UpdateResultSheetDto,
} from './dto/result-sheet.dto';

@ApiTags('result-sheets')
@ApiBearerAuth()
@Controller()
export class ResultSheetsController {
  constructor(private resultSheets: ResultSheetsService) {}

  @Post('resultsheet/create')
  @RequirePermissions('resultsheet:create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResultSheetDto) {
    return this.resultSheets.create(dto, user.userId);
  }

  @Get('resultsheets')
  @RequirePermissions('resultsheet:view')
  findAll(@Query() query: ResultSheetQueryDto) {
    return this.resultSheets.findAll(query);
  }

  @Get('resultsheet/:id')
  @RequirePermissions('resultsheet:view')
  findOne(@Param('id') id: string) {
    return this.resultSheets.findOne(id);
  }

  // Editing entries/lines re-opens the sheet for authorization (see service);
  // the editing user is recorded on the de-authorization audit event.
  @Put('resultsheet/update/:id')
  @RequirePermissions('resultentry:change')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateResultSheetDto) {
    return this.resultSheets.update(id, user.userId, dto);
  }

  // Authorization gate — restricted to resultsheet:authorize (the Authorizer
  // role). This is what allows a report to later be released.
  @Put('resultsheet/authorize/:id')
  @RequirePermissions('resultsheet:authorize')
  @ApiOperation({ summary: 'Authorize a result sheet (legacy: PUT /resultsheet/approve/:id)' })
  authorize(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resultSheets.authorize(id, user.userId);
  }
}
