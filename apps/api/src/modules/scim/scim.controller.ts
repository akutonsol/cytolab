import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseFilters } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { Service } from '../enterprise-auth/service-oauth/service-auth.guard';
import { ScimUsersService, ScimPrincipal } from './scim-users.service';
import { ScimExceptionFilter } from './scim-error';
import { ScimListQueryDto, ScimPatchDto, ScimUserWriteDto } from './dto/scim-user.dto';
import {
  SCIM_CONTENT_TYPE,
  SCIM_PERMISSION,
  SCIM_RESOURCE_TYPE_SCHEMA,
  SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA,
  SCIM_USERS_LOCATION,
  SCIM_USER_SCHEMA,
} from './scim.constants';

/**
 * Program 7 · Phase 7B.3 — inbound SCIM 2.0 Users API. EVERY route is `@Service()` (machine token only — the frozen
 * 7A.2b `ServiceAuthGuard` validates it; a human/portal/anonymous token fails closed) and requires
 * `identityprovisioning:manage`, enforced by the EXISTING single `PermissionsGuard` (no route evaluates authorization
 * itself). `labId` is taken ONLY from the token (via `LabContext`) — never from the body. Payloads are polymorphic SCIM
 * JSON, so the body is accepted raw (bypassing the global strict whitelist pipe) and the SERVICE performs authoritative
 * validation + deterministic conflict handling. All responses (incl. errors, via {@link ScimExceptionFilter}) are
 * `application/scim+json`. Discovery endpoints are static + read-only and advertise supported features honestly.
 */
@ApiTags('scim')
@UseFilters(ScimExceptionFilter)
@Controller('scim/v2')
export class ScimController {
  constructor(private readonly scim: ScimUsersService) {}

  private principal(req: Request): ScimPrincipal {
    const user = (req as unknown as { user?: { servicePrincipalId?: string } }).user;
    return { servicePrincipalId: user?.servicePrincipalId };
  }

  // ── Users CRUD / PATCH ──────────────────────────────────────────────────────────────────────────────────────────
  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Post('Users')
  async create(@Body() body: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { resource, created } = await this.scim.createUser(body as unknown as ScimUserWriteDto, this.principal(req));
    res.status(created ? 201 : 200).type(SCIM_CONTENT_TYPE).setHeader('Location', `${SCIM_USERS_LOCATION}/${resource.id}`);
    return resource;
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Get('Users/:id')
  get(@Param('id') id: string) {
    return this.scim.getUser(id);
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Get('Users')
  list(@Query() query: ScimListQueryDto) {
    return this.scim.listUsers(query);
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Put('Users/:id')
  replace(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.scim.replaceUser(id, body as unknown as ScimUserWriteDto, this.ifMatch(req), this.principal(req));
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Patch('Users/:id')
  patch(@Param('id') id: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.scim.patchUser(id, body as unknown as ScimPatchDto, this.ifMatch(req), this.principal(req));
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @HttpCode(204)
  @Delete('Users/:id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.scim.deleteUser(id, this.principal(req));
  }

  private ifMatch(req: Request): string | undefined {
    const h = req.headers['if-match'];
    return Array.isArray(h) ? h[0] : h;
  }

  // ── Discovery (static, read-only; honest advertisement — Users only, no Groups/filtering breadth) ────────────────
  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Get('ServiceProviderConfig')
  serviceProviderConfig() {
    return {
      schemas: [SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA],
      documentationUri: null,
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 }, // baseline: eq on userName/externalId only
      changePassword: { supported: false }, // 7B.3 performs no password management
      sort: { supported: false },
      etag: { supported: true },
      authenticationSchemes: [
        { type: 'oauthbearertoken', name: 'OAuth Bearer Token', description: 'ServicePrincipal client-credentials access token (7A.2b)', primary: true },
      ],
    };
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Get('ResourceTypes')
  resourceTypes() {
    return [
      { schemas: [SCIM_RESOURCE_TYPE_SCHEMA], id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_USER_SCHEMA, meta: { resourceType: 'ResourceType', location: '/scim/v2/ResourceTypes/User' } },
    ];
  }

  @Service()
  @RequirePermissions(SCIM_PERMISSION)
  @Header('Content-Type', SCIM_CONTENT_TYPE)
  @Get('Schemas')
  schemas() {
    return [
      {
        id: SCIM_USER_SCHEMA,
        name: 'User',
        description: 'SCIM core User (baseline: userName, name, emails, externalId, active)',
        attributes: [
          { name: 'userName', type: 'string', required: true, mutability: 'readWrite', uniqueness: 'server' },
          { name: 'externalId', type: 'string', required: false, mutability: 'immutable', uniqueness: 'server' },
          { name: 'active', type: 'boolean', required: false, mutability: 'readWrite' },
        ],
      },
    ];
  }
}
