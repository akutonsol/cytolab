import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto, WorkspaceQueryDto } from './dto/workspace.dto';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private workspaces: WorkspacesService) {}

  @Get()
  @RequirePermissions('workspace:view')
  findAll(@Query() query: WorkspaceQueryDto) {
    return this.workspaces.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('workspace:view')
  findOne(@Param('id') id: string) {
    return this.workspaces.findOne(id);
  }

  @Post()
  @RequirePermissions('workspace:create')
  create(@Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(dto);
  }

  @Put('update/:id')
  @RequirePermissions('workspace:change')
  update(@Param('id') id: string, @Body() dto: UpdateWorkspaceDto) {
    return this.workspaces.update(id, dto);
  }

  @Delete('delete/:id')
  @RequirePermissions('workspace:delete')
  remove(@Param('id') id: string) {
    return this.workspaces.remove(id);
  }
}
