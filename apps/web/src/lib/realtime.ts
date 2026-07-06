import { io, Socket } from 'socket.io-client';

// Single shared socket for the app. Auth rides on the HttpOnly `access_token`
// cookie: it's a host cookie for localhost (port-agnostic) and same-site, so
// `withCredentials` sends it on the handshake and the gateway's credentialed CORS
// accepts it.
//
// In dev we connect straight to the API origin (:4000) rather than through the
// Next `/api/v1` proxy — Next 308-redirects the trailing slash socket.io uses,
// which breaks the polling handshake, and it can't tunnel the WS upgrade anyway.
// Direct connection gives a true WebSocket. In prod, connect same-origin (behind
// a WS-capable reverse proxy); override with NEXT_PUBLIC_WS_URL if the API lives
// on another origin.
let socket: Socket | null = null;

const WS_ORIGIN =
  process.env.NEXT_PUBLIC_WS_URL ||
  (process.env.NODE_ENV !== 'production' ? 'http://localhost:4000' : '');

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_ORIGIN}/realtime`, {
      path: '/api/v1/socket.io',
      withCredentials: true,
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
