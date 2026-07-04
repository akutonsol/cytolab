import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  @RequirePermissions('record:view')
  @ApiOperation({ summary: 'Global cross-entity search (patients, records, clients, bills)' })
  find(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    if (!q || q.trim().length < 2) throw new BadRequestException('Search query must be at least 2 characters');
    return this.search.search(q, user.labId);
  }
}
