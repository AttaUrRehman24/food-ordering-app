import Redis from 'ioredis';
import type { CheckoutLock } from '../../application/ports';

/**  Documentation §7 — lock:order:{userId} (Redlock-style short lock) */
export class RedisCheckoutLock implements CheckoutLock {
  constructor(private readonly redis: Redis) {}

  async acquire(userId: string, ttlMs: number): Promise<boolean> {
    const key = `lock:order:${userId}`;
    const result = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }

  async release(userId: string): Promise<void> {
    await this.redis.del(`lock:order:${userId}`);
  }
}

export class InMemoryCheckoutLock implements CheckoutLock {
  private locks = new Set<string>();
  async acquire(userId: string) {
    if (this.locks.has(userId)) {
      return false;
    }
    this.locks.add(userId);
    return true;
  }
  async release(userId: string) {
    this.locks.delete(userId);
  }
}
