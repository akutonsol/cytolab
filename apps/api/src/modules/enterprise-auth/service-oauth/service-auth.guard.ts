import { Injectable, SetMetadata } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IS_SERVICE_KEY } from './service-oauth.constants';

/**
 * Program 7 · Phase 7A.2b — the dedicated service-token guard. A route opts into machine authentication with
 * `@Service()` + `@UseGuards(ServiceAuthGuard)`; the guard validates the service token via the 'jwt-service' strategy
 * and binds the `SERVICE` principal onto the request. Domain authorization still terminates at the EXISTING
 * `PermissionsGuard` (D5) — the service principal's token permissions are enforced there; there is no second
 * authorization engine. (Live global-chain wiring is a consumer-integration step; the human auth path is unchanged.)
 */
@Injectable()
export class ServiceAuthGuard extends AuthGuard('jwt-service') {}

/** Marks a route as service-authenticated (non-human). Reserved for guard/enforcement wiring; the human path ignores it. */
export const Service = () => SetMetadata(IS_SERVICE_KEY, true);
