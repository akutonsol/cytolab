import { Controller, Get } from '@nestjs/common';
import { DeliveryCapability, DeliveryProtected } from './delivery-capability.decorator';
import { ValidatedCapability } from './delivery-session.service';

/**
 * P5-5B-i — DELIVERY-TOKEN-only controller. `@DeliveryProtected()` at the class level guarantees every
 * route here is authorized ONLY by a valid delivery capability (never the staff JWT). The sole route so
 * far is session introspection — it proves the credential boundary; artifact byte routes
 * (descriptor / tiles / manifest / associated) arrive in P5-5B-ii and reuse this same boundary.
 */
@DeliveryProtected()
@Controller('wsi/delivery')
export class ArtifactDeliveryController {
  @Get('session')
  session(@DeliveryCapability() cap: ValidatedCapability) {
    return { slideId: cap.slideId, generationId: cap.generationId, scopes: cap.scopes };
  }
}
