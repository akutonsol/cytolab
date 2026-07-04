import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ResultTemplatesService } from './result-templates.service';
import { CreateResultTemplateDto, UpdateResultTemplateDto } from './dto/result-template.dto';

@ApiTags('result-templates')
@ApiBearerAuth()
@Controller('result-templates')
export class ResultTemplatesController {
  constructor(private templates: ResultTemplatesService) {}

  @Get()
  @RequirePermissions('resultentry:view')
  findAll(@Query('category') category?: string, @Query('isActive') isActive?: string, @Query('search') search?: string) {
    return this.templates.findAll({ category, isActive, search });
  }

  @Post()
  @RequirePermissions('resultentry:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResultTemplateDto) {
    return this.templates.create(dto, user.userId);
  }

  @Get(':id')
  @RequirePermissions('resultentry:view')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('resultentry:change')
  update(@Param('id') id: string, @Body() dto: UpdateResultTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('resultentry:change')
  remove(@Param('id') id: string) {
    return this.templates.remove(id);
  }

  // Applied to a result sheet — increments usageCount and returns the template.
  @Post(':id/use')
  @RequirePermissions('resultentry:change')
  use(@Param('id') id: string) {
    return this.templates.use(id);
  }
}
