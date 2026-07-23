import { applyDecorators, createParamDecorator, ExecutionContext, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { DELIVERY_CAPABILITY_KEY, DeliveryTokenGuard } from './delivery-token.guard';
import { ValidatedCapability } from './delivery-session.service';

/**
 * P5-5B-i — the composite that makes the credential boundary a single, hard-to-misapply unit: it opts the
 * route OUT of the staff-JWT/permission guards (`@Public()`) AND requires a valid delivery token
 * (`DeliveryTokenGuard`) together. Apply at the artifact-controller CLASS level so a later route cannot
 * accidentally be `@Public()` without the delivery guard.
 */
export function DeliveryProtected() {
  return applyDecorators(Public(), UseGuards(DeliveryTokenGuard));
}

/** Inject the redeemed ValidatedCapability attached by DeliveryTokenGuard. */
export const DeliveryCapability = createParamDecorator((_data: unknown, ctx: ExecutionContext): ValidatedCapability => {
  return (ctx.switchToHttp().getRequest() as Record<string, unknown>)[DELIVERY_CAPABILITY_KEY] as ValidatedCapability;
});
