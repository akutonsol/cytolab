import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { TeleconsultService } from './teleconsult.service';
import { CreateConsultDto, ListConsultQueryDto, RespondConsultDto, UpdateConsultDto } from './dto/teleconsult.dto';

@ApiTags('teleconsult')
@Controller('teleconsult')
export class TeleconsultController {
  constructor(private readonly svc: TeleconsultService) {}

  // ── Public (token-only) — declared before /:id so the literals win. ─────────
  @Public()
  @Get('public/:accessToken')
  publicCase(@Param('accessToken') accessToken: string) {
    return this.svc.publicCase(accessToken);
  }

  @ApiBearerAuth()
  @Get()
  @RequirePermissions('record:view')
  list(@Query() query: ListConsultQueryDto) {
    return this.svc.list(query);
  }

  @ApiBearerAuth()
  @Get('analytics')
  @RequirePermissions('record:view')
  analytics() {
    return this.svc.analytics();
  }

  @ApiBearerAuth()
  @Get('prefill/:recordId')
  @RequirePermissions('record:view')
  prefill(@Param('recordId') recordId: string) {
    return this.svc.prefill(recordId);
  }

  @ApiBearerAuth()
  @Post()
  @RequirePermissions('record:change')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConsultDto) {
    return this.svc.create(dto, user.userId);
  }

  @ApiBearerAuth()
  @Get(':id')
  @RequirePermissions('record:view')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @ApiBearerAuth()
  @Patch(':id')
  @RequirePermissions('record:change')
  update(@Param('id') id: string, @Body() dto: UpdateConsultDto) {
    return this.svc.update(id, dto);
  }

  @ApiBearerAuth()
  @Post(':id/accept')
  @RequirePermissions('record:change')
  accept(@Param('id') id: string) {
    return this.svc.accept(id);
  }

  @ApiBearerAuth()
  @Post(':id/decline')
  @RequirePermissions('record:change')
  decline(@Param('id') id: string) {
    return this.svc.decline(id);
  }

  @ApiBearerAuth()
  @Post(':id/resend')
  @RequirePermissions('record:change')
  resend(@Param('id') id: string) {
    return this.svc.resend(id);
  }

  // Public: the consultant submits their response using the access token only.
  @Public()
  @Post(':id/respond')
  respond(@Param('id') id: string, @Body() dto: RespondConsultDto) {
    return this.svc.respond(id, dto);
  }
}
