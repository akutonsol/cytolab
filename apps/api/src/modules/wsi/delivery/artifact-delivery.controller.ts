import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { DeliveryCapability, DeliveryProtected } from './delivery-capability.decorator';
import { ScopeError, ValidatedCapability } from './delivery-session.service';
import {
  ArtifactDeliveryService,
  ArtifactNotRegisteredError,
  ArtifactObjectMissingError,
  ArtifactStream,
  AssetRegistryIntegrityError,
  ASSOCIATED_ROLES,
  AssociatedRole,
  CoordinateError,
  ManifestStateError,
  TileBoundsError,
} from './artifact-delivery.service';

/**
 * P5-5B — DELIVERY-TOKEN-only artifact reads. `@DeliveryProtected()` (class level) authorizes every route
 * by a valid delivery capability only (never the staff JWT). Every response is `private, no-store`. All
 * typed failures are mapped to HTTP BEFORE any bytes are written; a mid-transfer source fault aborts the
 * (already-committed) response rather than emitting a false success.
 */
@DeliveryProtected()
@Controller('wsi/delivery')
export class ArtifactDeliveryController {
  constructor(private readonly artifacts: ArtifactDeliveryService) {}

  @Get('session')
  session(@DeliveryCapability() cap: ValidatedCapability) {
    return { slideId: cap.slideId, generationId: cap.generationId, scopes: cap.scopes };
  }

  @Get('descriptor')
  @Header('Cache-Control', 'private, no-store')
  descriptor(@DeliveryCapability() cap: ValidatedCapability): Promise<StreamableFile> {
    return this.serve(() => this.artifacts.descriptor(cap));
  }

  @Get('tiles/:level/:x/:y')
  @Header('Cache-Control', 'private, no-store')
  tile(
    @DeliveryCapability() cap: ValidatedCapability,
    @Param('level') level: string,
    @Param('x') x: string,
    @Param('y') y: string,
  ): Promise<StreamableFile> {
    return this.serve(() => this.artifacts.tile(cap, { level, x, y }));
  }

  @Get('manifest')
  @Header('Cache-Control', 'private, no-store')
  manifest(@DeliveryCapability() cap: ValidatedCapability): Promise<StreamableFile> {
    return this.serve(() => this.artifacts.manifest(cap));
  }

  @Get('associated/:role')
  @Header('Cache-Control', 'private, no-store')
  associated(@DeliveryCapability() cap: ValidatedCapability, @Param('role') role: string): Promise<StreamableFile> {
    if (!ASSOCIATED_ROLES.includes(role as AssociatedRole)) throw new BadRequestException('invalid associated role');
    return this.serve(() => this.artifacts.associated(cap, role as AssociatedRole));
  }

  /** Resolve the artifact (mapping typed errors → HTTP status BEFORE streaming), then stream it. */
  private async serve(resolve: () => Promise<ArtifactStream>): Promise<StreamableFile> {
    let artifact: ArtifactStream;
    try {
      artifact = await resolve();
    } catch (e) {
      throw mapArtifactError(e);
    }
    return new StreamableFile(artifact.stream, { type: artifact.contentType, length: artifact.sizeBytes });
  }
}

function mapArtifactError(e: unknown): HttpException {
  if (e instanceof ScopeError) return new ForbiddenException('missing capability scope');
  if (e instanceof CoordinateError) return new BadRequestException('invalid coordinate');
  if (e instanceof TileBoundsError || e instanceof ArtifactNotRegisteredError || e instanceof ArtifactObjectMissingError) {
    return new NotFoundException('artifact not found');
  }
  if (e instanceof AssetRegistryIntegrityError || e instanceof ManifestStateError) return new InternalServerErrorException('artifact state error');
  if (e instanceof HttpException) return e;
  return new ServiceUnavailableException('artifact temporarily unavailable'); // transient storage/DB fault
}
