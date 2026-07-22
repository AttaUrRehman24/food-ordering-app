import Redis from 'ioredis';
import { itemKey, type CartItem } from '../../domain/cart';
import type { CartStore } from '../../application/ports';

/**  Documentation §7 — cart:{userId} hash; TDR-5 Redis primary */
export class RedisCartStore implements CartStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = 86_400,
  ) {}

  private key(userId: string): string {
    return `cart:${userId}`;
  }

  async exists(userId: string): Promise<boolean> {
    return (await this.redis.exists(this.key(userId))) === 1;
  }

  async getItems(userId: string): Promise<CartItem[]> {
    const raw = await this.redis.hgetall(this.key(userId));
    const items: CartItem[] = [];
    for (const [field, value] of Object.entries(raw)) {
      if (field === 'total' || field === 'itemCount') {
        continue;
      }
      items.push(JSON.parse(value) as CartItem);
    }
    return items;
  }

  async saveItems(userId: string, items: CartItem[]): Promise<void> {
    const key = this.key(userId);
    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    for (const item of items) {
      const field = itemKey(item.productId, item.variantId);
      pipeline.hset(key, field, JSON.stringify(item));
    }
    const total = items
      .reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0)
      .toFixed(2);
    pipeline.hset(key, 'total', total);
    pipeline.expire(key, this.ttlSeconds);
    await pipeline.exec();
  }

  async clear(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}

export class InMemoryCartStore implements CartStore {
  private carts = new Map<string, CartItem[]>();

  async exists(userId: string) {
    return this.carts.has(userId);
  }
  async getItems(userId: string) {
    return [...(this.carts.get(userId) ?? [])];
  }
  async saveItems(userId: string, items: CartItem[]) {
    this.carts.set(userId, [...items]);
  }
  async clear(userId: string) {
    this.carts.delete(userId);
  }
}
