import Redis from 'ioredis';

const PRESENCE_TTL_SECONDS = 60;
const PRESENCE_PREFIX = 'ws:presence:';
const ORDER_CHANNEL_PREFIX = 'channel:order:';

/**  Documentation §7 / §10 — presence + Pub/Sub channel helpers */
export function presenceKey(userId: string): string {
  return `${PRESENCE_PREFIX}${userId}`;
}

export function orderChannel(userId: string): string {
  return `${ORDER_CHANNEL_PREFIX}${userId}`;
}

export class PresenceStore {
  constructor(private readonly redis: Redis) {}

  async markOnline(userId: string, connectionId: string): Promise<void> {
    await this.redis.set(
      presenceKey(userId),
      connectionId,
      'EX',
      PRESENCE_TTL_SECONDS,
    );
  }

  async heartbeat(userId: string, connectionId: string): Promise<void> {
    const current = await this.redis.get(presenceKey(userId));
    if (current === connectionId) {
      await this.redis.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);
    }
  }

  async markOffline(userId: string, connectionId: string): Promise<void> {
    const current = await this.redis.get(presenceKey(userId));
    if (current === connectionId) {
      await this.redis.del(presenceKey(userId));
    }
  }
}

export class OrderStatusPubSub {
  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
  ) {}

  async publishStatus(userId: string, payload: Record<string, unknown>): Promise<void> {
    await this.publisher.publish(orderChannel(userId), JSON.stringify(payload));
  }

  async subscribe(
    userId: string,
    handler: (payload: Record<string, unknown>) => void,
  ): Promise<() => Promise<void>> {
    const channel = orderChannel(userId);
    const onMessage = (ch: string, message: string) => {
      if (ch !== channel) {
        return;
      }
      try {
        handler(JSON.parse(message) as Record<string, unknown>);
      } catch {
        // ignore malformed
      }
    };
    this.subscriber.on('message', onMessage);
    await this.subscriber.subscribe(channel);
    return async () => {
      this.subscriber.off('message', onMessage);
      await this.subscriber.unsubscribe(channel);
    };
  }
}
