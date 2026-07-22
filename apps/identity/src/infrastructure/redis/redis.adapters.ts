import Redis from 'ioredis';
import type { OtpStore, RateLimiter, TokenDenylist } from '../../application/ports';

/**  Documentation §7 Redis key patterns */
export class RedisOtpStore implements OtpStore {
  constructor(private readonly redis: Redis) {}

  async set(userId: string, hash: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`otp:${userId}`, hash, 'EX', ttlSeconds);
  }

  async get(userId: string): Promise<string | null> {
    return this.redis.get(`otp:${userId}`);
  }

  async del(userId: string): Promise<void> {
    await this.redis.del(`otp:${userId}`);
  }

  async incrAttempts(userId: string, ttlSeconds: number): Promise<number> {
    const key = `otp:attempts:${userId}`;
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return n;
  }

  async clearAttempts(userId: string): Promise<void> {
    await this.redis.del(`otp:attempts:${userId}`);
  }
}

export class RedisTokenDenylist implements TokenDenylist {
  constructor(private readonly redis: Redis) {}

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`revoked:jti:${jti}`, '1', 'EX', Math.max(ttlSeconds, 1));
  }

  async isRevoked(jti: string): Promise<boolean> {
    const v = await this.redis.get(`revoked:jti:${jti}`);
    return v !== null;
  }
}

/** Sliding-window style fixed window counter —  Documentation §7 rl:{scope}:{id} */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async hit(scope: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
    const key = `rl:${scope}:${id}`;
    const n = await this.redis.incr(key);
    if (n === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return n <= limit;
  }
}
