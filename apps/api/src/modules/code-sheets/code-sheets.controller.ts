import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CodeSheetsService } from './code-sheets.service';
import { CreateCodeFindingDto, CreateCodeSheetDto } from './dto/code-sheet.dto';

// Legacy guarded both code sheets and code findings with codesheet:* permissions.
@ApiTags('code-sheets')
@ApiBearerAuth()
@Controller()
export class CodeSheetsController {
  constructor(private codeSheets: CodeSheetsService) {}

  @Get('codesheets')
  @RequirePermissions('codesheet:view')
  findCodeSheets() {
    return this.codeSheets.findCodeSheets();
  }

  @Post('codesheets')
  @RequirePermissions('codesheet:create')
  createCodeSheet(@Body() dto: CreateCodeSheetDto) {
    return this.codeSheets.createCodeSheet(dto);
  }

  @Delete('codesheets/delete/:id')
  @RequirePermissions('codesheet:delete')
  removeCodeSheet(@Param('id') id: string) {
    return this.codeSheets.removeCodeSheet(id);
  }

  @Get('codefindings')
  @RequirePermissions('codesheet:view')
  findCodeFindings() {
    return this.codeSheets.findCodeFindings();
  }

  @Post('codefindings')
  @RequirePermissions('codesheet:create')
  createCodeFinding(@Body() dto: CreateCodeFindingDto) {
    return this.codeSheets.createCodeFinding(dto);
  }

  @Delete('codefindings/delete/:id')
  @RequirePermissions('codesheet:delete')
  removeCodeFinding(@Param('id') id: string) {
    return this.codeSheets.removeCodeFinding(id);
  }
}
