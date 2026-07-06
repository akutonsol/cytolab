import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global so any service can inject RealtimeGateway to push scoped events.
 * JwtModule is registered locally (the AuthModule one is not exported) so the
 * gateway can verify handshake tokens with the shared JWT_SECRET.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
