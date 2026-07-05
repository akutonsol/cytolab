import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureKey } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../tenancy/lab-context';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator';

// Human-readable names for the 403 message.
const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = {
  WORKFORCE_MANAGEMENT: 'Workforce Management',
};

/**
 * Blocks a route when its @RequireFeature(key) module is disabled for the
 * caller's lab. It is a pure gate: it reads the LabFeature flag and either lets
 * the request through or returns 403 { code: 'FEATURE_DISABLED' }. It never
 * reads, writes, or deletes any business data — disabling a feature only closes
 * the door, it never touches what's behind it.
 *
 * labId is taken from the authenticated principal (`request.user.labId`) because
 * the tenancy interceptor that binds the ALS labId runs AFTER guards; the flag
 * lookup is then done under runSystem with that explicit labId.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureKey | undefined>(REQUIRE_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!feature) return true;

    const labId: string | undefined = ctx.switchToHttp().getRequest()?.user?.labId;
    if (!labId) throw new ForbiddenException('No lab context');

    const row = await this.labContext.runSystem(() =>
      this.prisma.labFeature.findFirst({
        where: { labId, featureKey: feature },
        select: { isEnabled: true },
      }),
    );
    if (row?.isEnabled) return true;

    throw new ForbiddenException({
      code: 'FEATURE_DISABLED',
      message: `${FEATURE_LABELS[feature] ?? feature} is not enabled for this lab`,
    });
  }
}
