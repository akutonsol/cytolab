import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * Realtime push gateway (socket.io).
 *
 * Clients authenticate with the same HttpOnly `access_token` cookie used for the
 * REST API (sent automatically on the same-origin, credentialed handshake), or a
 * bearer token via `handshake.auth.token`. On connect we verify the JWT, then join
 * the socket to per-lab / per-user / superuser rooms so services can push scoped
 * events. The socket.io path is kept under the `/api/v1` prefix so the Next.js dev
 * proxy forwards the handshake to the API.
 */
@WebSocketGateway({
  namespace: '/realtime',
  path: '/api/v1/socket.io',
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? ['http://localhost:3000'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        client.handshake.headers.cookie?.match(/access_token=([^;]+)/)?.[1];

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwt.verify(token, { secret: this.config.get<string>('JWT_SECRET') });
      if (payload?.type && payload.type !== 'access') {
        client.disconnect();
        return;
      }

      client.data.userId = payload.sub;
      client.data.labId = payload.labId;
      client.data.isSuperRole = payload.isSuperRole;

      if (payload.labId) client.join(`lab:${payload.labId}`);
      if (payload.sub) client.join(`user:${payload.sub}`);
      if (payload.isSuperRole) client.join('superusers');

      client.emit('connected', { status: 'ok', userId: payload.sub });
    } catch (err) {
      // Invalid/expired token — refuse the connection quietly.
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
    // No server-side state to clean up; rooms are dropped automatically.
  }

  /** Push an event to every client connected for a given lab. */
  emitToLab(labId: string | null | undefined, event: string, data: unknown) {
    if (!labId || !this.server) return;
    this.server.to(`lab:${labId}`).emit(event, data);
  }

  /** Push an event to a single user's connected sockets. */
  emitToUser(userId: string | null | undefined, event: string, data: unknown) {
    if (!userId || !this.server) return;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /** Push an event to all connected superusers. */
  emitToSuperusers(event: string, data: unknown) {
    if (!this.server) return;
    this.server.to('superusers').emit(event, data);
  }
}
