import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '@prisma/client';

export const REQUIRE_FEATURE_KEY = 'requireFeature';

/**
 * Marks a controller/route as gated on a lab feature flag. Paired with
 * {@link FeatureGuard}, which returns 403 { code: 'FEATURE_DISABLED' } when the
 * feature is off for the caller's lab. Purely a gate — it never touches data.
 */
export const RequireFeature = (feature: FeatureKey) =>
  SetMetadata(REQUIRE_FEATURE_KEY, feature);
