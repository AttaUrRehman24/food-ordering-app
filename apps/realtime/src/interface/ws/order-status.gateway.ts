import { randomUUID } from 'crypto';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { JwtAccessVerifier } from '../../infrastructure/auth/jwt-access.verifier';
import { OrderStatusPubSub, PresenceStore } from '../../infrastructure/redis/presence-pubsub';
import { createStructuredLog, logJson } from '@food-ordering/observability';

type AuthedSocket = WebSocket & {
  userId?: string;
  connectionId?: string;
  clientIp?: string;
  heartbeat?: NodeJS.Timeout;
};

const MAX_CONNECTIONS_PER_USER = Number(process.env.WS_MAX_CONNECTIONS_PER_USER ?? 5);
const MAX_CONNECTIONS_PER_IP = Number(process.env.WS_MAX_CONNECTIONS_PER_IP ?? 20);

/**
 *  Documentation §10 — authenticated WS at /ws; subscribe user to order channel; presence TTL heartbeat.
 * Local fan-out: one Redis subscription per userId, delivered to all sockets for that user.
 */
@WebSocketGateway({ path: '/ws', transports: ['websocket'] })
export class OrderStatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly connectionsByUser = new Map<string, Set<AuthedSocket>>();
  private readonly connectionsByIp = new Map<string, number>();
  private readonly unsubscribers = new Map<string, () => Promise<void>>();

  constructor(
    private readonly jwt: JwtAccessVerifier,
    private readonly presence: PresenceStore,
    private readonly pubSub: OrderStatusPubSub,
  ) {}

  async handleConnection(
    @ConnectedSocket() client: AuthedSocket,
    ...args: IncomingMessage[]
  ): Promise<void> {
    const req = args[0];
    const ip = String(req?.socket?.remoteAddress ?? 'unknown');
    const token = extractToken(req);

    if (!token) {
      client.close(4401, 'Unauthorized');
      return;
    }

    const claims = this.jwt.verify(token);
    if (!claims) {
      client.close(4401, 'Unauthorized');
      return;
    }

    const ipCount = this.connectionsByIp.get(ip) ?? 0;
    if (ipCount >= MAX_CONNECTIONS_PER_IP) {
      client.close(4429, 'Too many connections from IP');
      return;
    }

    const userSet = this.connectionsByUser.get(claims.userId) ?? new Set();
    if (userSet.size >= MAX_CONNECTIONS_PER_USER) {
      client.close(4429, 'Too many connections for user');
      return;
    }

    const connectionId = randomUUID();
    client.userId = claims.userId;
    client.connectionId = connectionId;
    client.clientIp = ip;

    userSet.add(client);
    this.connectionsByUser.set(claims.userId, userSet);
    this.connectionsByIp.set(ip, ipCount + 1);

    if (!this.unsubscribers.has(claims.userId)) {
      const unsub = await this.pubSub.subscribe(claims.userId, (payload) => {
        this.fanOut(claims.userId, payload);
      });
      this.unsubscribers.set(claims.userId, unsub);
    }

    await this.presence.markOnline(claims.userId, connectionId);
    client.heartbeat = setInterval(() => {
      void this.presence.heartbeat(claims.userId, connectionId);
    }, 30_000);

    client.send(
      JSON.stringify({
        type: 'connected',
        userId: claims.userId,
        channel: `channel:order:${claims.userId}`,
      }),
    );

    logJson(
      createStructuredLog('realtime', 'info', 'ws connected', null, {
        userId: claims.userId,
        connectionId,
      }),
    );
  }

  async handleDisconnect(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    if (client.heartbeat) {
      clearInterval(client.heartbeat);
    }
    if (client.userId && client.connectionId) {
      await this.presence.markOffline(client.userId, client.connectionId);
      const set = this.connectionsByUser.get(client.userId);
      set?.delete(client);
      if (set && set.size === 0) {
        this.connectionsByUser.delete(client.userId);
        const unsub = this.unsubscribers.get(client.userId);
        if (unsub) {
          await unsub();
          this.unsubscribers.delete(client.userId);
        }
      }
    }
    if (client.clientIp) {
      const n = this.connectionsByIp.get(client.clientIp) ?? 1;
      if (n <= 1) {
        this.connectionsByIp.delete(client.clientIp);
      } else {
        this.connectionsByIp.set(client.clientIp, n - 1);
      }
    }
  }

  private fanOut(userId: string, payload: Record<string, unknown>): void {
    const set = this.connectionsByUser.get(userId);
    if (!set) {
      return;
    }
    const message = JSON.stringify({ type: 'order.status.changed', ...payload });
    for (const socket of set) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }
}

function extractToken(req?: IncomingMessage): string | null {
  if (!req?.url) {
    return null;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const fromQuery = url.searchParams.get('token') ?? url.searchParams.get('access_token');
    if (fromQuery) {
      return fromQuery;
    }
  } catch {
    // ignore
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  const protocol = req.headers['sec-websocket-protocol'];
  if (typeof protocol === 'string' && protocol.startsWith('bearer.')) {
    return protocol.slice('bearer.'.length);
  }
  return null;
}
